import { createContentModel } from '$lib/index.js';
import { bindEditor } from '$lib/editor/index.js';
import { richTextDocument } from '$lib/shared/richText.js';

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

export type DemoNode = {
	type: string;
	attrs?: Record<string, unknown>;
	text?: string;
	marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
	content?: DemoNode[];
};

export type DemoDocument = {
	type: 'doc';
	version: number;
	meta?: Record<string, unknown>;
	content: DemoNode[];
};

export function buildDemo() {
	const model = createContentModel({
		blocks: import.meta.glob('./demo/blocks/*.svelte', { eager: true }),
		meta: {
			title: { default: 'Uncial demo document', required: true, validate: isNonEmptyString },
			author: { default: 'Demo Author' },
			publishedAt: { default: '2026-05-13', placeholder: 'YYYY-MM-DD' },
			tags: { default: ['demo', 'blocks'], input: 'json' }
		}
	});
	const { attributes, meta } = bindEditor(model);
	const attributesController = attributes.controller;
	const metaController = meta.controller;

	const initialDocument: DemoDocument = {
		type: 'doc',
		version: 0,
		meta: {
			title: 'Uncial demo document',
			author: 'Demo Author',
			publishedAt: '2026-05-13',
			tags: ['demo', 'blocks']
		},
		content: [
			{
				type: 'heading',
				attrs: { level: 2 },
				content: [{ type: 'text', text: 'Build pages from JSON. Edit them like pages.' }]
			},
			{
				type: 'paragraph',
				content: [
					{
						type: 'text',
						text: "Uncial is a backend-agnostic, block-based WYSIWYG editor for Svelte, powered by Tiptap, designed to bridge the gap between authoring and rendering. For CMS implementers, Uncial's primary value is achieving true 1:1 visual parity with zero code duplication: you define a custom block once as a single Svelte component and reuse that exact component across both the editor interface and the final frontend presentation. Coupled with built-in schema validation, typed attribute normalization, and support for deeply nested block content, Uncial significantly reduces development overhead and ensures a highly predictable, seamless content creation experience."
					}
				]
			},
			{
				type: 'callout',
				attrs: {
					tone: 'info',
					title: 'This editor is the demo.',
					body: richTextDocument(
						'Select this callout and pick a different tone from the sidebar. The dropdown, validation, editor view, and rendered view all come from one block definition. All it took to create this was a few lines of a Svelte component and Uncial handled the editing UI and attribute panel.'
					),
					showIcon: true
				}
			},
			{
				type: 'table',
				content: [
					{
						type: 'tableRow',
						content: [
							{
								type: 'tableHeader',
								content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Helper' }] }]
							},
							{
								type: 'tableHeader',
								content: [
									{
										type: 'paragraph',
										content: [{ type: 'text', text: 'Module' }]
									}
								]
							},
							{
								type: 'tableHeader',
								content: [
									{
										type: 'paragraph',
										content: [{ type: 'text', text: 'Description' }]
									}
								]
							}
						]
					},
					{
						type: 'tableRow',
						content: [
							{
								type: 'tableCell',
								content: [
									{
										type: 'paragraph',
										content: [
											{
												type: 'text',
												text: 'defineBlock(declaration)',
												marks: [{ type: 'code' }]
											}
										]
									}
								]
							},
							{
								type: 'tableCell',
								content: [
									{
										type: 'paragraph',
										content: [
											{
												type: 'text',
												text: 'uncial',
												marks: [{ type: 'link', attrs: { href: 'https://example.com/core' } }]
											}
										]
									}
								]
							},
							{
								type: 'tableCell',
								content: [
									{
										type: 'paragraph',
										content: [
											{
												type: 'text',
												text: 'Declares a Block in its component file.'
											}
										]
									}
								]
							}
						]
					}
				]
			},
			{
				type: 'row',
				attrs: {},
				content: [
					{
						type: 'card',
						attrs: {
							title: 'Define a block once.',
							subtitle: 'Then edit it like content.',
							body: richTextDocument(
								'This card is a Svelte component. Select it, change its title or body, and the same JSON drives the renderer.'
							)
						}
					},
					{
						type: 'card',
						attrs: {
							title: 'Keep content portable.',
							subtitle: 'Plain ProseMirror JSON.',
							body: richTextDocument(
								'Save it to an API, a database, or a file. Uncial stays focused on editing and rendering the document tree.'
							)
						}
					}
				]
			},
			{
				type: 'heading',
				attrs: { level: 2 },
				content: [{ type: 'text', text: 'The whole setup is just code.' }]
			},
			{
				type: 'paragraph',
				content: [
					{
						type: 'text',
						text: 'Declare blocks in their components, glob them into a content model, bind the editor to JSON, and render the same document anywhere.'
					}
				]
			},
			{
				type: 'codeBlock',
				attrs: { language: 'ts' },
				content: [
					{
						type: 'text',
						text: `<!-- blocks/PromoCard.svelte -->
<script module lang="ts">
  import { defineBlock } from 'uncial';
  export const block = defineBlock({
    id: 'promoCard',
    label: 'Promo Card',
    attributes: {
      title: '',
      body: { default: 'Write the editable part here.', input: 'textarea' }
    }
  });
</script>

// content.ts
import { createContentModel } from 'uncial';
export const model = createContentModel({
  blocks: import.meta.glob('./blocks/*.svelte', { eager: true })
});`
					}
				]
			},
			{
				type: 'callout',
				attrs: {
					tone: 'danger',
					title: 'This is alpha software.',
					body: richTextDocument(
						'Uncial is in early development, so expect bugs, missing features, and breaking changes. Feedback and contributions are very welcome!'
					),
					showIcon: true
				}
			}
		]
	};

	return { model, attributesController, metaController, initialDocument };
}
