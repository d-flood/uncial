import {
	Editor as TiptapEditor,
	getSchema,
	type AnyExtension,
	type JSONContent
} from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import type { Schema } from '@tiptap/pm/model';
import type { ActionReturn } from 'svelte/action';
import { fromStore, writable } from 'svelte/store';
import { parseMetaDraftValues } from '../core/meta.js';
import { normalizeDocument } from '../core/normalize.js';
import { validateDocument } from '../core/validate.js';
import { resolveRegistry } from '../core/registry.js';
import type { BlockPage } from '../core/runtime.js';
import type {
	AttributeInputs,
	BlockDefinition,
	BlockRegistry,
	ContentSchema,
	ValidationIssue
} from '../core/types.js';
import type { PMDoc } from '../shared/document.js';
import { emptyDocument } from '../shared/content.js';
import { createEditorExtensions, type BlockEnvironment } from '../shared/tiptap.js';
import {
	createImagePreviews,
	missingImagePlaceholder,
	toDisplayValues,
	type ImagePreviews
} from '../shared/imagePreviews.js';
import type { AttributeInputLoader, ContentModel, ExtensionLoader } from '../model.js';
import {
	createAttributesController,
	createInitialState,
	type BlockAttributesController
} from './attributesController.js';
import { createEditorEnvironment, withBaseLinks, withBaseThumbnails } from './editorEnvironment.js';
import { createMetaController } from './metaController.js';
import type { FileSource } from './fileSource.js';
import type { ImageSource } from './imageSource.js';

export const NO_EXTENSIONS: AnyExtension[] = [];

export function extensionLoadersOf(model: ContentModel): ExtensionLoader[] {
	return [...model.marks.map((mark) => mark.extension), ...model.editor.extensions];
}

export function loadExtensions(loaders: ExtensionLoader[]): Promise<AnyExtension[]> {
	return Promise.all(
		loaders.map(async (load) => {
			const loaded = await load();
			return 'default' in loaded ? loaded.default : loaded;
		})
	);
}

export async function loadAttributeInputs(
	loaders: Record<string, AttributeInputLoader>
): Promise<AttributeInputs> {
	const entries = await Promise.all(
		Object.entries(loaders).map(async ([kind, load]) => [kind, (await load()).default] as const)
	);
	return Object.fromEntries(entries);
}

export interface AttachEditorOptions {
	blocks?: BlockRegistry | BlockDefinition[];
	schema?: ContentSchema;
	json?: JSONContent;
	meta?: Record<string, unknown>;
	extensions?: AnyExtension[];
	attributesController?: BlockAttributesController | null;
	/**
	 * Whether selecting a block opens its attributes panel by itself. Right for
	 * a panel that holds a column of its own; wrong for one that floats over the
	 * document, where an unasked-for panel covers the page. Off, the block's own
	 * gutter label opens it.
	 */
	autoOpenAttributes?: boolean;
	/** Previews the canvas shows in place of just-uploaded `input: 'image'` values. */
	imagePreviews?: ImagePreviews;
	/** The page, Media source and Svelte context every Block context reads; keep it reference-stable. */
	blockEnvironment?: BlockEnvironment;
	onIssue?: (issue: ValidationIssue) => void;
	onChange?: (json: JSONContent) => void;
	onMetaChange?: (meta: Record<string, unknown>) => void;
	onEditor?: (editor: TiptapEditor | null) => void;
}

function toEditorDocument(document: JSONContent): JSONContent {
	const {
		version: _version,
		meta: _meta,
		...editorDocument
	} = document as JSONContent & {
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

export function attachEditor(
	node: HTMLElement,
	initialOptions: AttachEditorOptions = {}
): ActionReturn<AttachEditorOptions> {
	const internalController = createAttributesController();
	let options = initialOptions;
	let registry = resolveRegistry(options.blocks ?? []);
	let schema = options.schema;
	let controller = options.attributesController ?? internalController;
	let controllerState = createInitialState();
	let unsubscribe = controller.subscribe((state) => {
		controllerState = state;
	});
	let editor: TiptapEditor | null = null;
	// ProseMirror rebuilds node attrs in schema order. Script-owned attrs must
	// retain the source representation until their owning script changes them.
	let readOnlyAttrs = new Map<string, Record<string, unknown>>();
	// `lastSerialized` is the editor *body* serialization (meta/version stripped)
	// and gates the `setContent` push in `syncEditorDocument`. `lastEmitted` is
	// the *full* normalized serialization (body + meta + version) and gates the
	// validate + emit pass, so a metadata-only change is still validated and
	// emitted even when the body is unchanged.
	let lastSerialized = '';
	let lastEmitted = '';

	function normalize(
		document: JSONContent | null | undefined,
		meta: Record<string, unknown> | undefined = options.meta
	): PMDoc {
		return normalizeDocument(
			{ ...((document ?? emptyDocument()) as Partial<PMDoc>), meta },
			registry,
			schema
		);
	}

	/** Mirrors metadata the host set into the doc node, outside the undo history. */
	function syncDocMeta(meta: Record<string, unknown> | undefined): void {
		if (!editor) return;
		const next = meta ?? null;
		if (JSON.stringify(editor.state.doc.attrs.meta ?? null) === JSON.stringify(next)) return;
		editor.view.dispatch(
			editor.state.tr
				.setDocAttribute('meta', next)
				.setMeta('addToHistory', false)
				.setMeta('preventUpdate', true)
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

	function rememberReadOnlyAttrs(document: PMDoc): void {
		const next = new Map<string, Record<string, unknown>>();
		const visit = (content: PMDoc['content']): void => {
			for (const child of content ?? []) {
				const id = child.attrs?.id;
				if (registry.get(child.type)?.readOnly && typeof id === 'string' && child.attrs) {
					next.set(id, child.attrs);
				}
				visit(child.content);
			}
		};

		visit(document.content);
		readOnlyAttrs = next;
	}

	function restoreReadOnlyAttrs(document: JSONContent): JSONContent {
		const restore = (node: JSONContent): JSONContent => {
			const content = node.content?.map(restore);
			const id = node.attrs?.id;
			const attrs =
				typeof node.type === 'string' && registry.get(node.type)?.readOnly && typeof id === 'string'
					? (readOnlyAttrs.get(id) ?? node.attrs)
					: node.attrs;

			return {
				...node,
				...(attrs ? { attrs } : {}),
				...(content ? { content } : {})
			};
		};

		return restore(document);
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
		if (options.autoOpenAttributes === false) {
			return false;
		}

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
			options.extensions ?? [],
			options.imagePreviews,
			options.blockEnvironment
		);
		const initialContent = normalizeAndValidate(options.json ?? emptyDocument());
		rememberReadOnlyAttrs(initialContent);
		const sanitized = sanitizeForEditorSchema(
			toEditorDocument(initialContent),
			getSchema(extensions)
		);
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
				const { attrs, ...body } = tiptap.getJSON();
				const raw = restoreReadOnlyAttrs(body);
				const normalized = normalize(raw, attrs?.meta ?? options.meta);
				rememberReadOnlyAttrs(normalized);
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

		syncDocMeta(initialContent.meta);
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
		syncDocMeta((nextDocument as PMDoc).meta);
		lastSerialized = serialized;
		controller.syncFromSelection('update');
	}

	function applyOptions(nextOptions: AttachEditorOptions, forceRecreate = false): void {
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
		rememberReadOnlyAttrs(normalized);
		syncDocMeta(normalized.meta);
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

export interface BindEditorOptions {
	json?: JSONContent;
	meta?: Record<string, unknown>;
	onIssue?: (issue: ValidationIssue) => void;
	onChange?: (json: JSONContent) => void;
	onMetaChange?: (meta: Record<string, unknown>) => void;
	onEditor?: (editor: TiptapEditor | null) => void;
}

/**
 * For a host drawing its own editor layout: `use:editor.attach={options}` on the element to edit
 * in, `<BlockAttributesPanel {...editor.attributes} />` and `<DocumentMetaPanel {...editor.meta} />`.
 */
export function bindEditor(
	model: ContentModel,
	sources: { imageSource?: ImageSource; fileSource?: FileSource } = {}
) {
	const base = () => model.base;
	const imageSource = withBaseThumbnails(sources.imageSource, base);
	const fileSource = withBaseLinks(sources.fileSource, base);
	const imagePreviews = createImagePreviews((src) =>
		sources.imageSource?.missing?.(src) ? missingImagePlaceholder(src) : undefined
	);
	const attributesController = createAttributesController();
	const metaFields = fromStore(writable(model.schemaFor().metaFields));
	const metaController = createMetaController(metaFields.current);
	const attributeInputs = fromStore(writable<AttributeInputs>());
	void loadAttributeInputs(model.editor.attributeInputs).then(
		(inputs) => (attributeInputs.current = inputs)
	);
	const loaders = extensionLoadersOf(model);
	const extensions = loaders.length ? loadExtensions(loaders) : Promise.resolve(NO_EXTENSIONS);
	let editor: TiptapEditor | null = null;
	let page: BlockPage = { path: '', template: '', meta: {} };
	const environment = createEditorEnvironment({
		base,
		registry: () => model.blocks,
		media: () => imageSource ?? null,
		page: () => page,
		imagePreviews,
		metaController: () => metaController,
		metaFields: () => metaFields.current,
		onMetaCommit: ({ meta, validation }) => {
			if (!validation.ok || !editor) return;
			editor.view.dispatch(closeHistory(editor.state.tr.setDocAttribute('meta', meta)));
		}
	});
	metaController.subscribe(({ draft }) => {
		const fields = metaFields.current;
		const meta = parseMetaDraftValues(fields, draft);
		page = {
			path: '',
			template: model.templateFor(meta)?.id ?? '',
			meta: toDisplayValues(fields, meta, imagePreviews, base())
		};
		environment.notify();
	});

	function attach(node: HTMLElement, initial: BindEditorOptions): ActionReturn<BindEditorOptions> {
		let options = initial;
		let handle: ActionReturn<AttachEditorOptions> | undefined;
		let loaded: AnyExtension[] = NO_EXTENSIONS;
		let destroyed = false;
		let seededMeta = '';
		const toAttach = (next: BindEditorOptions): AttachEditorOptions => {
			const meta = JSON.stringify(next.meta ?? {});
			if (meta !== seededMeta) {
				seededMeta = meta;
				const fields = model.schemaFor(next.meta).metaFields;
				if (fields !== metaFields.current) {
					metaFields.current = fields;
					metaController.setMetaFields(fields);
				}
				metaController.reset(next.meta ?? {});
			}
			return {
				...next,
				blocks: model.blocks,
				schema: model.schemaFor(next.meta),
				extensions: loaded,
				attributesController,
				imagePreviews,
				blockEnvironment: environment,
				onEditor: (tiptap) => {
					editor = tiptap;
					next.onEditor?.(tiptap);
				}
			};
		};

		void extensions.then((list) => {
			if (destroyed) return;
			loaded = list;
			handle = attachEditor(node, toAttach(options));
		});

		return {
			update(next) {
				options = next;
				handle?.update?.(toAttach(next));
			},
			destroy() {
				destroyed = true;
				handle?.destroy?.();
			}
		};
	}

	return {
		attach,
		attributes: {
			controller: attributesController,
			blocks: model.blocks,
			imageSource,
			fileSource,
			imagePreviews,
			imageChoosers: model.editor.imageChoosers,
			get attributeInputs() {
				return attributeInputs.current;
			}
		},
		meta: {
			controller: metaController,
			get fields() {
				return metaFields.current;
			},
			imageSource,
			fileSource,
			imagePreviews,
			imageChoosers: model.editor.imageChoosers,
			get attributeInputs() {
				return attributeInputs.current;
			}
		}
	};
}
