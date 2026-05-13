import { Editor as TiptapEditor, type AnyExtension, type JSONContent } from '@tiptap/core';
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
	type BlockAttributesController,
	type BlockAttributesState
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

function createInitialControllerState(): BlockAttributesState {
	return {
		open: false,
		mode: null,
		selectedBlockId: '',
		draftAttrs: {},
		validationErrors: {},
		activeBlock: null,
		allowedBlockIds: [],
		containerChildren: [],
		link: {
			open: false,
			attrs: {}
		}
	};
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
	let controllerState = createInitialControllerState();
	let unsubscribe = controller.subscribe((state) => {
		controllerState = state;
	});
	let editor: TiptapEditor | null = null;
	let lastSerialized = '';

	function normalizeAndValidate(document: JSONContent | null | undefined): JSONContent {
		const normalized = normalizeDocument(
			{ ...((document ?? emptyDocument()) as Partial<PMDoc>), meta: options.meta },
			registry,
			schema
		);

		if (schema) {
			validateDocument(normalized, registry, schema, { onIssue: options.onIssue });
		}

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
		const initialContent = normalizeAndValidate(options.json ?? emptyDocument());
		const initialEditorContent = toEditorDocument(initialContent);
		lastSerialized = JSON.stringify(initialEditorContent);
		setExternalDocument(initialContent);

		editor = new TiptapEditor({
			element: node,
			extensions: createEditorExtensions(
				registry,
				schema,
				(pos) => controller.openAttributesAt(pos),
				options.extensions ?? []
			),
			content: initialEditorContent,
			onUpdate: ({ editor: tiptap }) => {
				const raw = tiptap.getJSON();
				const normalized = normalizeAndValidate(raw);
				lastSerialized = JSON.stringify(toEditorDocument(normalized));
				setExternalDocument(normalized);
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

		const editorDocument = toEditorDocument(nextDocument);
		const serialized = JSON.stringify(editorDocument);
		if (serialized === lastSerialized) return;

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

		const normalized = normalizeAndValidate(options.json ?? emptyDocument());
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
