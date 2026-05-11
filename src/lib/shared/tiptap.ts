import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Mark, mergeAttributes, Node, type AnyExtension } from '@tiptap/core';
import type { NodeView as ProseMirrorNodeView } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type {
	AttributeSpec,
	BlockDefinition,
	BlockRegistry,
	ContentSchema
} from '../core/types.js';
import { resolveRegistry } from '../core/registry.js';
import {
	coerceAttributeValue,
	normalizeBlockAttributes,
	serializeBlockAttributes
} from '../core/attributes.js';
import type { PMNode } from './document.js';
import type { RichTextFeature } from '../core/types.js';
import { lowlight } from './syntaxHighlight.js';
import { sanitizeHref } from '../render/sanitize.js';

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

type MountedComponent = { destroy(): void };

export function getBlockDefaultAttrs(block: BlockDefinition): Record<string, unknown> {
	return normalizeBlockAttributes(block, {});
}

function mountBlockEditorComponent(
	block: BlockDefinition,
	node: ProseMirrorNode,
	container: HTMLElement,
	contentDOM: HTMLElement | null,
	mounted: MountedComponent | null,
	onActivate?: BlockActivationCallback,
	getPos?: () => number
): MountedComponent {
	mounted?.destroy();
	const createEditorMount = block.components.editor.plugin.createEditorMount;
	if (!createEditorMount) {
		throw new Error(`Runtime "${block.runtime}" does not support editor node views`);
	}

	return createEditorMount({
		target: container,
		inline: block.behaviors.inline ?? false,
		component: block.components.editor,
		props: {
			attrs: node.attrs ?? {},
			content: (node.content?.toJSON() ?? []) as PMNode[],
			contentDOM,
			blockId: block.id,
			label: block.label,
			draggable: block.behaviors.draggable ?? true,
			onActivate: getPos && onActivate ? () => onActivate(getPos()) : undefined
		}
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
		target.closest('input, textarea, select, button:not([data-drag-handle]), a[href]')
	);
}

function createBlockNodeView(
	block: BlockDefinition,
	node: ProseMirrorNode,
	getPos?: () => number,
	onActivate?: BlockActivationCallback
): ProseMirrorNodeView {
	const dom = document.createElement(block.behaviors.inline ? 'span' : 'div');
	dom.className = 'uncial-nodeview';
	dom.dataset.uncialBlockId = block.id;
	dom.draggable = block.behaviors.draggable ?? true;
	const contentDOM = block.content
		? document.createElement(block.behaviors.inline ? 'span' : 'div')
		: null;
	let lastAttrs = JSON.stringify(node.attrs ?? {});

	function syncBlockPosition(): void {
		if (!getPos) return;
		const pos = getPos();
		dom.dataset.uncialBlockPos = String(pos);
	}

	if (contentDOM) {
		contentDOM.className = 'uncial-nodeview-content';
	}

	let mounted: MountedComponent | null = null;
	mounted = mountBlockEditorComponent(block, node, dom, contentDOM, mounted, onActivate, getPos);
	syncBlockPosition();

	return {
		dom,
		contentDOM: contentDOM ?? undefined,
		update(nextNode) {
			if (nextNode.type.name !== block.id) return false;
			dom.draggable = block.behaviors.draggable ?? true;
			syncBlockPosition();
			const nextAttrs = JSON.stringify(nextNode.attrs ?? {});
			if (nextAttrs === lastAttrs) {
				return true;
			}

			lastAttrs = nextAttrs;
			mounted = mountBlockEditorComponent(
				block,
				nextNode,
				dom,
				contentDOM,
				mounted,
				onActivate,
				getPos
			);
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
			mounted?.destroy();
		}
	};
}

function createBlockNodeExtension(
	block: BlockDefinition,
	containerContentExpression: string,
	onActivate?: BlockActivationCallback
): AnyExtension {
	const isContainer = Boolean(block.content);

	return Node.create({
		name: block.id,
		group: block.behaviors.inline ? 'inline' : 'block',
		inline: block.behaviors.inline ?? false,
		content: isContainer ? containerContentExpression : undefined,
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
								const direct = element.getAttribute(name);
								if (direct !== null) return coerceAttributeValue(spec, direct);
								const attrs = safeParseJSON(element.getAttribute('data-uncial-attrs'));
								return coerceAttributeValue(spec, attrs[name]);
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
			return ({ node, getPos }) =>
				createBlockNodeView(block, node, getPos as () => number, onActivate);
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

const LinkMark = Mark.create({
	name: 'link',
	inclusive: false,
	addAttributes() {
		return {
			href: {
				default: null,
				parseHTML: (element: HTMLElement) => sanitizeHref(element.getAttribute('href'))
			},
			target: { default: null },
			rel: { default: null }
		};
	},
	parseHTML() {
		return [{ tag: 'a[href]' }];
	},
	renderHTML({ HTMLAttributes }) {
		const href = sanitizeHref(HTMLAttributes.href);
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

function createBaseExtensions(
	schema?: ContentSchema,
	extensions: AnyExtension[] = []
): AnyExtension[] {
	const marks = schema?.allowedMarks ?? new Set(['bold', 'italic', 'strike', 'code', 'link']);
	const includeBold = marks.has('bold');
	const includeItalic = marks.has('italic');
	const includeStrike = marks.has('strike');
	const includeCode = marks.has('code');
	const includeLink = marks.has('link');

	return [
		StarterKit.configure({
			bold: includeBold ? {} : false,
			italic: includeItalic ? {} : false,
			strike: includeStrike ? {} : false,
			code: includeCode ? {} : false,
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
		...(includeLink ? [LinkMark] : []),
		...extensions
	];
}

export function createRichTextExtensions(features: ReadonlySet<RichTextFeature>): AnyExtension[] {
	return [
		StarterKit.configure({
			bold: features.has('bold') ? {} : false,
			italic: features.has('italic') ? {} : false,
			strike: features.has('strike') ? {} : false,
			code: features.has('code') ? {} : false,
			heading: features.has('heading') ? {} : false,
			bulletList: features.has('bulletList') ? {} : false,
			orderedList: features.has('orderedList') ? {} : false,
			blockquote: features.has('blockquote') ? {} : false,
			codeBlock: false,
			horizontalRule: features.has('horizontalRule') ? {} : false,
			hardBreak: features.has('hardBreak') ? {} : false,
			link: false
		}),
		...(features.has('codeBlock') ? [CodeBlockLowlight.configure({ lowlight })] : [])
	];
}

export function createEditorExtensions(
	blocks: BlockRegistry | BlockDefinition[] = [],
	schema?: ContentSchema,
	onActivateBlock?: BlockActivationCallback,
	extensions: AnyExtension[] = []
): AnyExtension[] {
	const registry = resolveRegistry(blocks);
	const allowedBlockNames = registry.blocks
		.filter((block: BlockDefinition) => !schema || schema.allowedBlocks.has(block.id))
		.map((block: BlockDefinition) => block.id);
	const containerContentExpression = allowedBlockNames.length
		? `(${allowedBlockNames.join(' | ')})*`
		: '';
	const blockExtensions = registry.blocks
		.filter((block: BlockDefinition) => !schema || schema.allowedBlocks.has(block.id))
		.map((block: BlockDefinition) =>
			createBlockNodeExtension(block, containerContentExpression, onActivateBlock)
		);

	return [...createBaseExtensions(schema), ...blockExtensions, ...extensions];
}
