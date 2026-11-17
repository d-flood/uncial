import StarterKit from '@tiptap/starter-kit';
import Code from '@tiptap/extension-code';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import {
	Extension,
	Mark,
	mergeAttributes,
	Node,
	type AnyExtension,
	type Editor as TiptapEditor
} from '@tiptap/core';
import type { EditorView, NodeView as ProseMirrorNodeView } from '@tiptap/pm/view';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type {
	AttributeSpec,
	BlockContentDefinition,
	BlockDefinition,
	BlockRegistry,
	ContentSchema
} from '../core/types.js';
import { DEFAULT_MARKS, resolveRegistry } from '../core/registry.js';
import type { BlockContext, BlockEditorMountHandle, BlockPage } from '../core/runtime.js';
import type { ImageSource } from '../editor/imageSource.js';
import { blockAttrs, blockSummary, emptyPage } from '../runtime/blockContext.js';
import {
	coerceAttributeValue,
	normalizeBlockAttributes,
	serializeBlockAttributes
} from '../core/attributes.js';
import type { PMNode } from './document.js';
import type { RichTextFeature } from '../core/types.js';
import { lowlight } from './syntaxHighlight.js';
import { sanitizeHref } from '../render/sanitize.js';
import { toDisplayValues, toStoredValues, type ImagePreviews } from './imagePreviews.js';
import { withBase } from './mediaValues.js';
import { resolveImageSrc, stripBase } from '../render/resolveImageSrc.js';
import { SVELTE_RUNTIME_ID } from './runtimeId.js';
import { mountSvelteBlock } from '../editor/svelteEditorMount.js';

export type BlockActivationCallback = (pos: number) => void;

function safeParseJSON(raw: string | null): Record<string, unknown> {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		return typeof parsed === 'object' && parsed !== null ? parsed : {};
	} catch {
		return {};
	}
}

type MountedComponent = BlockEditorMountHandle;

export function getBlockDefaultAttrs(block: BlockDefinition): Record<string, unknown> {
	return normalizeBlockAttributes(block, {});
}

/** What the `Editor` around the document supplies to every Block context. */
export interface BlockEnvironment {
	page(): BlockPage;
	media(): ImageSource | null;
	/** The model's base, applied to root-relative media URLs and links. */
	base?(): string;
	/** The `Editor`'s own Svelte context. */
	context?: Map<unknown, unknown>;
	/** Called whenever `page()` or `media()` may answer differently. */
	subscribe?(listener: () => void): () => void;
}

const defaultEnvironment: BlockEnvironment = { page: emptyPage, media: () => null };

interface NodeViewHost {
	block: BlockDefinition;
	registry: BlockRegistry;
	view: EditorView;
	getPos?: () => number | undefined;
	onActivate?: BlockActivationCallback;
	imagePreviews?: ImagePreviews;
	environment: BlockEnvironment;
}

function displayAttrs(host: NodeViewHost, node: ProseMirrorNode): Record<string, unknown> {
	const { block, imagePreviews, environment } = host;
	return toDisplayValues(
		block.attributes,
		node.attrs ?? {},
		imagePreviews,
		environment.base?.() ?? ''
	);
}

function buildBlockEditorProps(host: NodeViewHost, node: ProseMirrorNode): Record<string, unknown> {
	const { block, getPos, onActivate } = host;
	return {
		attrs: displayAttrs(host, node),
		content: (node.content?.toJSON() ?? []) as PMNode[],
		blockId: block.id,
		label: block.label,
		draggable: block.behaviors.draggable ?? true,
		// ProseMirror's getPos can return undefined when the node is not currently
		// in the document (e.g. mid-transaction); skip activation in that case
		// rather than reporting a bogus position.
		onActivate:
			getPos && onActivate
				? () => {
						const pos = getPos();
						if (pos !== undefined) onActivate(pos);
					}
				: undefined
	};
}

function buildBlockContext(host: NodeViewHost, node: ProseMirrorNode): BlockContext {
	const { block, registry, view, getPos, imagePreviews, environment } = host;
	const pos = getPos?.();
	let parent: BlockContext['parent'] = null;
	let index = 0;
	let siblings: BlockContext['siblings'] = [];
	if (pos !== undefined && pos <= view.state.doc.content.size) {
		const $pos = view.state.doc.resolve(pos);
		index = $pos.index();
		siblings = $pos.parent.children.map((child) =>
			blockSummary(registry, { type: child.type.name, attrs: child.attrs })
		);
		for (let depth = $pos.depth; depth > 0; depth -= 1) {
			const ancestor = $pos.node(depth);
			const definition = registry.get(ancestor.type.name);
			if (!definition) continue;
			parent = blockSummary(registry, {
				type: ancestor.type.name,
				attrs: withBase(definition.attributes, ancestor.attrs, environment.base?.() ?? '')
			});
			break;
		}
	}
	const attrs = node.attrs ?? {};
	return {
		id: typeof attrs.id === 'string' ? attrs.id : '',
		type: block.id,
		attrs: blockAttrs(registry, block.id, displayAttrs(host, node)),
		editing: true,
		// Addressed by position, not by selection: Tiptap's `updateAttributes`
		// command writes to the node at the current selection, and nothing in a
		// block's own component moves the selection onto it.
		//
		// Deliberately no `.focus()` here: updates often originate from form
		// controls inside the block component, and refocusing the editor view
		// would steal focus from them on every keystroke.
		update: (patch) => {
			if (block.readOnly) return;
			const pos = getPos?.();
			if (pos === undefined) return;
			// Merge over the live node: the one these props were built from is stale after any write.
			const current = view.state.doc.nodeAt(pos);
			if (!current) return;
			const stored = toStoredValues(
				block.attributes,
				patch,
				imagePreviews,
				environment.base?.() ?? ''
			);
			view.dispatch(
				closeHistory(view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...stored }))
			);
		},
		parent,
		index,
		siblings,
		page: environment.page(),
		media: environment.media()
	};
}

function mountBlockEditorComponent(
	host: NodeViewHost,
	node: ProseMirrorNode,
	container: HTMLElement,
	contentDOM: HTMLElement | null,
	mounted: MountedComponent | null
): MountedComponent {
	mounted?.destroy();
	const { block } = host;
	const { plugin, runtime } = block.components.editor;
	const createEditorMount =
		plugin.createEditorMount ?? (runtime === SVELTE_RUNTIME_ID ? mountSvelteBlock : undefined);
	if (!createEditorMount) {
		throw new Error(`Runtime "${block.runtime}" does not support editor node views`);
	}

	return createEditorMount({
		target: container,
		inline: block.behaviors.inline ?? false,
		component: block.components.editor,
		contentDOM,
		props: buildBlockEditorProps(host, node),
		block: buildBlockContext(host, node),
		context: host.environment.context
	});
}

function isDragHandleEvent(event: Event): boolean {
	const target = event.target;
	return target instanceof Element && Boolean(target.closest('[data-drag-handle]'));
}

function isInteractiveNodeViewEvent(event: Event): boolean {
	const target = event.target;
	if (!(target instanceof Element)) return false;
	return Boolean(
		target.closest(
			'input, textarea, select, button:not([data-drag-handle]), a[href], [data-uncial-field]'
		)
	);
}

function contextSignature(context: BlockContext): string {
	const { update: _update, media: _media, ...data } = context;
	void _update;
	void _media;
	return JSON.stringify(data);
}

function createBlockNodeView(
	host: NodeViewHost,
	node: ProseMirrorNode,
	editor?: TiptapEditor
): ProseMirrorNodeView {
	const { block, getPos } = host;
	const dom = document.createElement(block.behaviors.inline ? 'span' : 'div');
	dom.className = 'uncial-nodeview';
	dom.dataset.uncialBlockId = block.id;
	dom.draggable = block.behaviors.draggable ?? true;
	const contentDOM = block.content
		? document.createElement(block.behaviors.inline ? 'span' : 'div')
		: null;
	let currentNode = node;
	let lastAttrs = JSON.stringify(node.attrs ?? {});

	function syncBlockPosition(): void {
		if (!getPos) return;
		const pos = getPos();
		if (pos === undefined) return;
		dom.dataset.uncialBlockPos = String(pos);
	}

	if (contentDOM) {
		contentDOM.className = 'uncial-nodeview-content';
	}

	let mounted: MountedComponent | null = null;
	mounted = mountBlockEditorComponent(host, node, dom, contentDOM, mounted);
	let lastContext = buildBlockContext(host, node);
	let lastSignature = contextSignature(lastContext);
	syncBlockPosition();

	/** Pushes props and Block context when the node, its place in the document, or the page changed. */
	function refresh(): void {
		const nextAttrs = JSON.stringify(currentNode.attrs ?? {});
		const nextContext = buildBlockContext(host, currentNode);
		const nextSignature = contextSignature(nextContext);
		if (
			nextAttrs === lastAttrs &&
			nextSignature === lastSignature &&
			nextContext.media === lastContext.media
		) {
			return;
		}
		lastAttrs = nextAttrs;
		lastContext = nextContext;
		lastSignature = nextSignature;
		if (mounted?.update) {
			// Update the mounted component's props in place so DOM state (focus,
			// selection, scroll position) inside the block component survives.
			//
			// Queued, not applied here: this runs inside `view.dispatch`, itself
			// inside the event handler that edited the attribute, and a prop
			// written to a separately mounted component in that window does not
			// reach it — the block would keep rendering its old attributes until
			// something else re-rendered it. A microtask is outside that window
			// and still lands before paint.
			const nextProps = buildBlockEditorProps(host, currentNode);
			queueMicrotask(() => mounted?.update?.(nextProps, nextContext));
		} else {
			// Fall back to a full remount for runtimes without update support.
			mounted = mountBlockEditorComponent(host, currentNode, dom, contentDOM, mounted);
		}
	}

	const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
		if (transaction.docChanged) refresh();
	};
	editor?.on('transaction', onTransaction);
	const unsubscribe = host.environment.subscribe?.(refresh);

	return {
		dom,
		contentDOM: contentDOM ?? undefined,
		update(nextNode) {
			if (nextNode.type.name !== block.id) return false;
			dom.draggable = block.behaviors.draggable ?? true;
			syncBlockPosition();
			currentNode = nextNode;
			refresh();
			return true;
		},
		stopEvent(event) {
			if (event.type.startsWith('drag') && isDragHandleEvent(event)) return false;
			return isInteractiveNodeViewEvent(event);
		},
		ignoreMutation(mutation) {
			if (!contentDOM) return true;
			return !contentDOM.contains(mutation.target);
		},
		selectNode() {
			dom.classList.add('ProseMirror-selectednode');
		},
		deselectNode() {
			dom.classList.remove('ProseMirror-selectednode');
		},
		destroy() {
			editor?.off('transaction', onTransaction);
			unsubscribe?.();
			mounted?.destroy();
		}
	};
}

function containerContentExpression(content: BlockContentDefinition): string {
	// Core "flow" semantics (see core/normalize.ts) preserve any block-level
	// children inside a container: paragraphs, headings, lists, code blocks,
	// blockquotes, and custom blocks alike. Every non-inline node in the editor
	// schema (StarterKit nodes and custom blocks) belongs to the "block" group,
	// so "block*" mirrors what core considers valid flow content. Zero-or-more
	// (not one-or-more) is deliberate: persisted documents commonly contain
	// empty containers (`"content": []`), and those must stay schema-valid.

	// A container that names its admissible children gets those names in place
	// of the whole "block" group, which is what makes the constraint hold for
	// paste and for any other route a child can take into the document.
	if (content.allowedBlocks?.length) {
		return `(${content.allowedBlocks.join(' | ')})*`;
	}

	switch (content.kind) {
		case 'flow':
		default:
			return 'block*';
	}
}

function createBlockNodeExtension(
	block: BlockDefinition,
	registry: BlockRegistry,
	environment: BlockEnvironment,
	onActivate?: BlockActivationCallback,
	imagePreviews?: ImagePreviews
): AnyExtension {
	const isContainer = Boolean(block.content);

	return Node.create({
		name: block.id,
		group: block.behaviors.inline ? 'inline' : 'block',
		inline: block.behaviors.inline ?? false,
		content: block.content ? containerContentExpression(block.content) : undefined,
		atom: !isContainer,
		defining: isContainer,
		isolating: isContainer,
		draggable: block.behaviors.draggable ?? true,
		selectable: block.behaviors.selectable ?? true,
		addAttributes() {
			return Object.fromEntries(
				(Object.entries(block.attributes) as [string, AttributeSpec<unknown>][]).map(
					([name, spec]) => [
						name,
						{
							default: spec.default,
							parseHTML: (element: HTMLElement) => {
								// Prefer the typed JSON copy; a direct HTML attribute is always a string.
								const attrs = safeParseJSON(element.getAttribute('data-uncial-attrs'));
								if (name in attrs) return coerceAttributeValue(spec, attrs[name]);
								return coerceAttributeValue(spec, element.getAttribute(name));
							},
							renderHTML: (attributes: Record<string, unknown>) => {
								const value = coerceAttributeValue(spec, attributes[name]);
								return ['string', 'number', 'boolean'].includes(typeof value)
									? { [name]: value }
									: {};
							}
						}
					]
				)
			);
		},
		parseHTML() {
			return [{ tag: block.html?.parseTag ?? `div[data-uncial-block="${block.id}"]` }];
		},
		addNodeView() {
			return ({ node, view, getPos, editor }) =>
				createBlockNodeView(
					{ block, registry, view, getPos, onActivate, imagePreviews, environment },
					node,
					editor
				);
		},
		renderHTML({ HTMLAttributes, node }) {
			const normalizedAttrs = normalizeBlockAttributes(block, node.attrs ?? {});
			if (block.html?.render) {
				return block.html.render(normalizedAttrs);
			}

			return [
				'div',
				mergeAttributes(HTMLAttributes, {
					'data-uncial-block': block.id,
					'data-uncial-attrs': serializeBlockAttributes(block, normalizedAttrs),
					class: 'uncial-block'
				}),
				isContainer ? 0 : block.label
			];
		}
	});
}

const LinkMark = Mark.create<{ base: () => string }>({
	name: 'link',
	inclusive: false,
	addOptions() {
		return { base: () => '' };
	},
	addAttributes() {
		return {
			href: {
				default: null,
				parseHTML: (element: HTMLElement) => {
					const href = sanitizeHref(element.getAttribute('href'));
					return href && stripBase(href, this.options.base());
				}
			},
			target: { default: null },
			rel: { default: null },
			title: { default: null },
			class: { default: null }
		};
	},
	parseHTML() {
		return [{ tag: 'a[href]' }];
	},
	renderHTML({ HTMLAttributes }) {
		const sanitized = sanitizeHref(HTMLAttributes.href);
		const href = sanitized && resolveImageSrc(sanitized, this.options.base());
		const rest = { ...HTMLAttributes };
		delete rest.href;
		return ['a', mergeAttributes(rest, href ? { href } : {}), 0];
	},
	addCommands() {
		return {
			toggleLink:
				(attributes?: {
					href: string;
					target?: string | null;
					rel?: string | null;
					class?: string | null;
					title?: string | null;
				}) =>
				({ commands }) =>
					Boolean(sanitizeHref(attributes?.href)) &&
					commands.toggleMark(
						this.name,
						{ ...attributes, href: sanitizeHref(attributes?.href) },
						{ extendEmptyMarkRange: true }
					),
			unsetLink:
				() =>
				({ commands }) =>
					commands.unsetMark(this.name, { extendEmptyMarkRange: true })
		};
	}
});

function createDocumentIdentityExtension(registry: BlockRegistry): AnyExtension {
	const blockTypes = [
		'paragraph',
		'heading',
		'blockquote',
		'codeBlock',
		'horizontalRule',
		'bulletList',
		'orderedList',
		'listItem',
		'table',
		'tableRow',
		'tableCell',
		'tableHeader',
		...registry.blocks.filter((block) => !block.behaviors.inline).map((block) => block.id)
	];

	return Extension.create({
		name: 'documentIdentity',
		addGlobalAttributes() {
			return [
				{
					types: blockTypes,
					attributes: {
						id: { default: null, rendered: false }
					}
				},
				{
					types: ['heading'],
					attributes: {
						slug: { default: null, rendered: false }
					}
				},
				{
					// Holds the document's metadata so a metadata commit is one undo step.
					types: ['doc'],
					attributes: {
						meta: { default: null, rendered: false }
					}
				}
			];
		}
	});
}

/**
 * Inline code that may carry other marks.
 *
 * Tiptap's Code ships `excludes: "_"`, the wildcard, so code cannot combine
 * with emphasis or a link. ProseMirror does not report that as an error: it
 * drops the containing node while parsing, so a document holding bold code
 * loses whole blocks on the round trip through the editor, silently.
 *
 * The renderer nests marks, and documents are authored against the renderer —
 * bold code is what "**`media-src`**" means in prose — so the editor's schema
 * is the side that has to give.
 */
const CombinableCode = Code.extend({ excludes: '' });

function createBaseExtensions(
	schema: ContentSchema | undefined,
	extensions: AnyExtension[],
	base: () => string
): AnyExtension[] {
	const marks = schema?.allowedMarks ?? new Set<string>(DEFAULT_MARKS);
	const includeBold = marks.has('bold');
	const includeItalic = marks.has('italic');
	const includeStrike = marks.has('strike');
	const includeCode = marks.has('code');
	const includeLink = marks.has('link');
	// A host that already registers its own copy keeps it; Tiptap rejects duplicate names.
	const includeMark = (name: string) =>
		marks.has(name) && !extensions.some((extension) => extension.name === name);

	return [
		StarterKit.configure({
			bold: includeBold ? {} : false,
			italic: includeItalic ? {} : false,
			strike: includeStrike ? {} : false,
			code: false,
			heading: { levels: [2, 3, 4, 5, 6] },
			bulletList: {},
			orderedList: {},
			listItem: {},
			blockquote: {},
			codeBlock: false,
			horizontalRule: {},
			link: false
		}),
		CodeBlockLowlight.configure({ lowlight }),
		Table.configure({ resizable: false }),
		TableRow,
		TableHeader,
		TableCell,
		...(includeCode ? [CombinableCode] : []),
		...(includeLink ? [LinkMark.configure({ base })] : []),
		...(includeMark('superscript') ? [Superscript] : []),
		...(includeMark('subscript') ? [Subscript] : [])
	];
}

export function createRichTextExtensions(features: ReadonlySet<RichTextFeature>): AnyExtension[] {
	return [
		StarterKit.configure({
			bold: features.has('bold') ? {} : false,
			italic: features.has('italic') ? {} : false,
			strike: features.has('strike') ? {} : false,
			code: false,
			heading: features.has('heading') ? {} : false,
			bulletList: features.has('bulletList') ? {} : false,
			orderedList: features.has('orderedList') ? {} : false,
			blockquote: features.has('blockquote') ? {} : false,
			codeBlock: false,
			horizontalRule: features.has('horizontalRule') ? {} : false,
			hardBreak: features.has('hardBreak') ? {} : false,
			link: false
		}),
		...(features.has('code') ? [CombinableCode] : []),
		...(features.has('codeBlock') ? [CodeBlockLowlight.configure({ lowlight })] : [])
	];
}

export function createEditorExtensions(
	blocks: BlockRegistry | BlockDefinition[] = [],
	schema?: ContentSchema,
	onActivateBlock?: BlockActivationCallback,
	extensions: AnyExtension[] = [],
	imagePreviews?: ImagePreviews,
	environment: BlockEnvironment = defaultEnvironment
): AnyExtension[] {
	const registry = resolveRegistry(blocks);
	const blockExtensions = registry.blocks
		.filter((block: BlockDefinition) => !schema || schema.allowedBlocks.has(block.id))
		.map((block: BlockDefinition) =>
			createBlockNodeExtension(block, registry, environment, onActivateBlock, imagePreviews)
		);

	return [
		...createBaseExtensions(schema, extensions, () => environment.base?.() ?? ''),
		createDocumentIdentityExtension(registry),
		...blockExtensions,
		...extensions
	];
}
