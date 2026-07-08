import { Editor as TiptapEditor, getSchema, type AnyExtension, type JSONContent } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import type { ActionReturn } from 'svelte/action';
import { normalizeDocument } from '../core/normalize.js';
import { validateDocument } from '../core/validate.js';
import { resolveRegistry } from '../core/registry.js';
import type {
	BlockDefinition,
	BlockRegistry,
	ContentSchema,
	ValidationIssue
} from '../core/types.js';
import type { PMDoc } from '../shared/document.js';
import { emptyDocument } from '../shared/content.js';
import { createEditorExtensions } from '../shared/tiptap.js';
import {
	createBlockAttributesController,
	createInitialState,
	type BlockAttributesController
} from './attributesController.js';

export interface BindEditorOptions {
	blocks?: BlockRegistry | BlockDefinition[];
	schema?: ContentSchema;
	json?: JSONContent;
	meta?: Record<string, unknown>;
	extensions?: AnyExtension[];
	attributesController?: BlockAttributesController | null;
	onIssue?: (issue: ValidationIssue) => void;
	onChange?: (json: JSONContent) => void;
	onMetaChange?: (meta: Record<string, unknown>) => void;
	onEditor?: (editor: TiptapEditor | null) => void;
}

function toEditorDocument(document: JSONContent): JSONContent {
	const { version: _version, meta: _meta, ...editorDocument } = document as JSONContent & {
		version?: unknown;
		meta?: unknown;
	};
	void _version;
	void _meta;

	return editorDocument;
}

interface EditorSchemaSanitizeResult {
	document: JSONContent;
	issues: ValidationIssue[];
}

/**
 * Pre-validates a document against the Tiptap editor schema. Tiptap v3
 * replaces the ENTIRE document with empty content when any node in the
 * initial content is invalid for the editor schema (e.g. an unknown block
 * type that core normalization deliberately preserves), which would then
 * propagate an empty document to the host via `onChange`. Instead, strip only
 * the offending top-level nodes, report each one as an issue, and hand Tiptap
 * the surviving siblings.
 */
function sanitizeForEditorSchema(
	editorDocument: JSONContent,
	editorSchema: Schema
): EditorSchemaSanitizeResult {
	try {
		editorSchema.nodeFromJSON(editorDocument).check();
		return { document: editorDocument, issues: [] };
	} catch {
		// Fall through and strip the offending top-level nodes.
	}

	const content = Array.isArray(editorDocument.content) ? editorDocument.content : [];
	const surviving: JSONContent[] = [];
	const issues: ValidationIssue[] = [];

	content.forEach((child, index) => {
		try {
			editorSchema.nodeFromJSON(child).check();
			surviving.push(child);
		} catch (error) {
			const blockType = typeof child?.type === 'string' ? child.type : undefined;
			issues.push({
				code: 'UNKNOWN_BLOCK',
				path: ['content', index],
				message: `Node "${blockType ?? '(unknown)'}" is not supported by the editor schema and was excluded from the editing session`,
				severity: 'warning',
				details: {
					block: blockType,
					reason: error instanceof Error ? error.message : String(error)
				}
			});
		}
	});

	return { document: { ...editorDocument, content: surviving }, issues };
}

export function bindEditor(
	node: HTMLElement,
	initialOptions: BindEditorOptions = {}
): ActionReturn<BindEditorOptions> {
	const internalController = createBlockAttributesController();
	let options = initialOptions;
	let registry = resolveRegistry(options.blocks ?? []);
	let schema = options.schema;
	let controller = options.attributesController ?? internalController;
	let controllerState = createInitialState();
	let unsubscribe = controller.subscribe((state) => {
		controllerState = state;
	});
	let editor: TiptapEditor | null = null;
	// `lastSerialized` is the editor *body* serialization (meta/version stripped)
	// and gates the `setContent` push in `syncEditorDocument`. `lastEmitted` is
	// the *full* normalized serialization (body + meta + version) and gates the
	// validate + emit pass, so a metadata-only change is still validated and
	// emitted even when the body is unchanged.
	let lastSerialized = '';
	let lastEmitted = '';

	function normalize(document: JSONContent | null | undefined): PMDoc {
		return normalizeDocument(
			{ ...((document ?? emptyDocument()) as Partial<PMDoc>), meta: options.meta },
			registry,
			schema
		);
	}

	function validate(normalized: PMDoc): void {
		if (schema) {
			validateDocument(normalized, registry, schema, { onIssue: options.onIssue });
		}
	}

	function normalizeAndValidate(document: JSONContent | null | undefined): PMDoc {
		const normalized = normalize(document);
		validate(normalized);
		return normalized;
	}

	function setController(nextController: BlockAttributesController): void {
		if (controller === nextController) return;

		unsubscribe();
		controller.detach();
		controller = nextController;
		unsubscribe = controller.subscribe((state) => {
			controllerState = state;
		});

		if (editor) {
			controller.attach(editor, registry, schema);
			controller.syncFromSelection('selection');
		}
	}

	function shouldAutoOpenAttributesForSelection(nextEditor: TiptapEditor): boolean {
		if (controller.isSelectionAutoOpenSuppressed()) {
			return false;
		}

		const selection = nextEditor.state.selection as TiptapEditor['state']['selection'] & {
			node?: { type?: { name?: string } };
		};
		const selectedNode = selection.node;
		const selectedBlockId = selectedNode?.type?.name;
		if (!selectedBlockId) {
			return false;
		}

		const block = registry.get(selectedBlockId);
		if (!block || block.content) {
			return false;
		}

		return !controllerState.open || controllerState.selectedBlockId !== selectedBlockId;
	}

	function setExternalDocument(nextDocument: JSONContent): void {
		const serialized = JSON.stringify(nextDocument);
		if (serialized !== JSON.stringify(options.json ?? emptyDocument())) {
			options.onChange?.(nextDocument);
		}

		const nextMeta = (nextDocument as JSONContent & { meta?: Record<string, unknown> }).meta ?? {};
		if (JSON.stringify(nextMeta) !== JSON.stringify(options.meta ?? {})) {
			options.onMetaChange?.(nextMeta);
		}
	}

	function createEditor(): void {
		const extensions = createEditorExtensions(
			registry,
			schema,
			(pos) => controller.openAttributesAt(pos),
			options.extensions ?? []
		);
		const initialContent = normalizeAndValidate(options.json ?? emptyDocument());
		const sanitized = sanitizeForEditorSchema(toEditorDocument(initialContent), getSchema(extensions));
		sanitized.issues.forEach((issue) => options.onIssue?.(issue));
		const initialEditorContent = sanitized.document;
		lastSerialized = JSON.stringify(initialEditorContent);
		lastEmitted = JSON.stringify(initialContent);
		setExternalDocument(initialContent);

		editor = new TiptapEditor({
			element: node,
			extensions,
			content: initialEditorContent,
			onUpdate: ({ editor: tiptap }) => {
				const raw = tiptap.getJSON();
				const normalized = normalize(raw);
				const serialized = JSON.stringify(normalized);
				// Skip the (comparatively expensive) validate + emit pass when the
				// full normalized document (body + meta) is byte-identical to what
				// we last emitted. A single doc edit round-trips through onChange →
				// the host re-sets `json` → applyOptions, so without this guard each
				// keystroke would normalize+validate+stringify the same document
				// twice per cycle.
				if (serialized !== lastEmitted) {
					lastEmitted = serialized;
					lastSerialized = JSON.stringify(toEditorDocument(normalized));
					validate(normalized);
					setExternalDocument(normalized);
				}
				controller.syncFromSelection('update');
			},
			onSelectionUpdate: ({ editor: tiptap }) => {
				controller.syncFromSelection('selection');
				if (shouldAutoOpenAttributesForSelection(tiptap)) {
					controller.openAttributes();
				}
			}
		});

		options.onEditor?.(editor);
		controller.attach(editor, registry, schema);
		controller.syncFromSelection('selection');
	}

	function destroyEditor(): void {
		controller.detach();
		editor?.destroy();
		editor = null;
		options.onEditor?.(null);
	}

	function syncEditorDocument(nextDocument: JSONContent): void {
		if (!editor) return;

		const sanitized = sanitizeForEditorSchema(toEditorDocument(nextDocument), editor.schema);
		const editorDocument = sanitized.document;
		const serialized = JSON.stringify(editorDocument);
		if (serialized === lastSerialized) return;

		sanitized.issues.forEach((issue) => options.onIssue?.(issue));
		editor.commands.setContent(editorDocument, { emitUpdate: false });
		lastSerialized = serialized;
		controller.syncFromSelection('update');
	}

	function applyOptions(nextOptions: BindEditorOptions, forceRecreate = false): void {
		const previousBlocks = options.blocks;
		const previousSchema = options.schema;
		const previousExtensions = options.extensions;

		options = nextOptions;
		registry = resolveRegistry(options.blocks ?? []);
		schema = options.schema;
		setController(options.attributesController ?? internalController);

		// Recreation is keyed on *reference* identity of `blocks`/`schema`/
		// `extensions` — a full teardown + rebuild of the Tiptap instance is the
		// only safe way to swap the block set or editor extensions, but it also
		// discards selection/undo state. Callers MUST pass stable references for
		// these across renders and only produce a fresh array/object when the
		// content genuinely changes; otherwise every render (and therefore every
		// keystroke, since editing updates `json`) would remount the editor.
		// The in-repo callers (`Editor.svelte`, the `uncial-editor` custom element)
		// hold these in `$state`/props so they stay reference-stable while only
		// `json`/`meta` change. A structural compare is deliberately avoided here:
		// `blocks` carries functions and Svelte components that are not safely or
		// cheaply serializable.
		const shouldRecreate =
			forceRecreate ||
			previousBlocks !== options.blocks ||
			previousSchema !== options.schema ||
			previousExtensions !== options.extensions;

		if (shouldRecreate) {
			destroyEditor();
			createEditor();
			return;
		}

		const normalized = normalize(options.json ?? emptyDocument());
		const serialized = JSON.stringify(normalized);
		// Same guard as `onUpdate`, keyed on the full document (body + meta): when
		// the external document normalizes to exactly what we last emitted (the
		// common case for the edit round-trip), there is nothing to validate,
		// emit, or push back into Tiptap. `syncEditorDocument` skips the actual
		// `setContent` on its own when only the metadata differs.
		if (serialized === lastEmitted) return;

		lastEmitted = serialized;
		validate(normalized);
		setExternalDocument(normalized);
		syncEditorDocument(normalized);
	}

	createEditor();

	return {
		update(nextOptions) {
			applyOptions(nextOptions);
		},
		destroy() {
			unsubscribe();
			destroyEditor();
		}
	};
}
