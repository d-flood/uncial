import StarterKit from '@tiptap/starter-kit';
import { mergeAttributes, Node, type AnyExtension, type JSONContent } from '@tiptap/core';
import type { NodeView as ProseMirrorNodeView } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { mount, unmount } from 'svelte';
import type {
	AttributeSpec,
	BlockDefinition,
	BlockRegistry,
	ContentSchema,
	BlockComponents
} from '../core/types.js';
import { resolveRegistry } from '../core/registry.js';

function safeParseJSON(raw: string | null): Record<string, unknown> {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		return typeof parsed === 'object' && parsed !== null ? parsed : {};
	} catch {
		return {};
	}
}

export function getBlockDefaultAttrs(block: BlockDefinition): Record<string, unknown> {
	const defaults: Record<string, unknown> = {};
	for (const [name, spec] of Object.entries(block.attributes) as [
		string,
		AttributeSpec<unknown>
	][]) {
		defaults[name] = spec.default;
	}
	return defaults;
}

function mountBlockEditorComponent(
	block: BlockDefinition,
	component: BlockComponents['editor'],
	node: ProseMirrorNode,
	container: HTMLElement,
	mounted: Record<string, any> | null
): Record<string, any> {
	if (mounted) {
		void unmount(mounted);
	}

	const host = document.createElement(block.behaviors.inline ? 'span' : 'div');
	host.className = 'uncial-nodeview-host';
	container.replaceChildren(host);

	return mount(component, {
		target: host,
		props: {
			...(node.attrs ?? {})
		}
	});
}

function createBlockNodeView(block: BlockDefinition, node: ProseMirrorNode): ProseMirrorNodeView {
	const dom = document.createElement(block.behaviors.inline ? 'span' : 'div');
	dom.className = 'uncial-nodeview';

	let mounted: Record<string, any> | null = null;
	mounted = mountBlockEditorComponent(block, block.components.editor, node, dom, mounted);

	return {
		dom,
		update(nextNode) {
			if (nextNode.type.name !== block.id) return false;
			mounted = mountBlockEditorComponent(block, block.components.editor, nextNode, dom, mounted);
			return true;
		},
		selectNode() {
			dom.classList.add('ProseMirror-selectednode');
		},
		deselectNode() {
			dom.classList.remove('ProseMirror-selectednode');
		},
		destroy() {
			if (mounted) {
				void unmount(mounted);
			}
		}
	};
}

function createBlockNodeExtension(block: BlockDefinition): AnyExtension {
	return Node.create({
		name: block.id,
		group: block.behaviors.inline ? 'inline' : 'block',
		inline: block.behaviors.inline ?? false,
		atom: true,
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
								if (direct !== null) return direct;
								const attrs = safeParseJSON(element.getAttribute('data-uncial-attrs'));
								return attrs[name] ?? spec.default;
							},
							renderHTML: (attributes: Record<string, unknown>) =>
								attributes[name] === undefined ? {} : { [name]: attributes[name] }
						}
					]
				)
			);
		},
		parseHTML() {
			return [{ tag: block.html?.parseTag ?? `div[data-uncial-block="${block.id}"]` }];
		},
		addNodeView() {
			return ({ node }) => createBlockNodeView(block, node);
		},
		renderHTML({ HTMLAttributes, node }) {
			if (block.html?.render) {
				return block.html.render(node.attrs ?? {});
			}

			return [
				'div',
				mergeAttributes(HTMLAttributes, {
					'data-uncial-block': block.id,
					'data-uncial-attrs': JSON.stringify(HTMLAttributes),
					class: 'uncial-block'
				}),
				block.label
			];
		}
	});
}

function createBaseExtensions(schema?: ContentSchema): AnyExtension[] {
	const marks = schema?.allowedMarks ?? new Set(['bold', 'italic', 'link']);
	const includeBold = marks.has('bold');
	const includeItalic = marks.has('italic');
	const includeLink = marks.has('link');

	return [
		StarterKit.configure({
			bold: includeBold ? {} : false,
			italic: includeItalic ? {} : false,
			link: includeLink
				? {
						openOnClick: false,
						autolink: true,
						linkOnPaste: true
					}
				: false
		})
	];
}

export function createEditorExtensions(
	blocks: BlockRegistry | BlockDefinition[] = [],
	schema?: ContentSchema
): AnyExtension[] {
	const registry = resolveRegistry(blocks);
	const blockExtensions = registry.blocks
		.filter((block: BlockDefinition) => !schema || schema.allowedBlocks.has(block.id))
		.map((block: BlockDefinition) => createBlockNodeExtension(block));

	return [...createBaseExtensions(schema), ...blockExtensions];
}

export function emptyDocument(): JSONContent {
	return {
		type: 'doc',
		content: [{ type: 'paragraph' }]
	};
}
