import {
	createBlockAttributesController,
	createBlockRegistry,
	createDocumentMetaController,
	createSchema,
	defineSvelteBlock,
	hasRichTextContent,
	richTextDocument
} from '$lib/index.js';
import Callout from './demo/Callout.svelte';
import Card from './demo/Card.svelte';
import RowView from './demo/RowView.svelte';

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
	const card = defineSvelteBlock({
		id: 'card',
		label: 'Card',
		description: 'Typed attributes with normalization and validation.',
		attributes: {
			title: {
				default: 'Launch checklist',
				required: true,
				validate: isNonEmptyString
			},
			subtitle: 'A compact Svelte block',
			body: {
				default: richTextDocument(
					'Use rich text for the part authors should edit, and typed attributes for the parts your component owns.'
				),
				input: 'richtext',
				richText: { features: ['bold', 'italic', 'bulletList', 'orderedList'] },
				validate: hasRichTextContent
			}
		},
		component: Card
	});

	const callout = defineSvelteBlock({
		id: 'callout',
		label: 'Callout',
		description: 'Tone-tinted notice with a validated variant and rich text body.',
		attributes: {
			tone: {
				default: 'info',
				options: [
					{ value: 'info', label: 'Info' },
					{ value: 'success', label: 'Success' },
					{ value: 'warning', label: 'Warning' },
					{ value: 'danger', label: 'Danger' }
				]
			},
			title: { default: 'Heads up', required: true, validate: isNonEmptyString },
			body: {
				default: richTextDocument(
					'Callouts share the same rich text stack — bold, italic, and links all work.'
				),
				input: 'richtext',
				richText: { features: ['bold', 'italic', 'link'] },
				validate: hasRichTextContent
			},
			showIcon: true
		},
		component: Callout
	});

	const row = defineSvelteBlock({
		id: 'row',
		label: 'Row',
		description: 'Lay out any other blocks side by side.',
		attributes: {},
		component: RowView,
		content: { kind: 'flow' }
	});

	const blocks = createBlockRegistry([card, callout, row]);
	const metaFields = {
		title: { default: 'Uncial demo document', required: true, validate: isNonEmptyString },
		author: { default: 'Demo Author' },
		publishedAt: { default: '2026-05-13', placeholder: 'YYYY-MM-DD' },
		tags: { default: ['demo', 'blocks'], input: 'json' as const }
	};
	const schema = createSchema(blocks, { metaFields });
	const attributesController = createBlockAttributesController();
	const metaController = createDocumentMetaController(schema.metaFields);

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
						text: 'Register blocks, create a schema, bind the editor to JSON, and render the same document anywhere.'
					}
				]
			},
			{
				type: 'codeBlock',
				attrs: { language: 'ts' },
				content: [
					{
						type: 'text',
						text: `import {
  Editor,
  Renderer,
  createBlockRegistry,
  createSchema,
  defineSvelteBlock,
  richTextDocument
} from 'uncial';
import PromoCard from './PromoCard.svelte';

const promoCard = defineSvelteBlock({
  id: 'promoCard',
  label: 'Promo Card',
  attributes: {
    title: '',
    body: { default: richTextDocument('Write the editable part here.'), input: 'richtext' }
  },
  component: PromoCard
});

const blocks = createBlockRegistry([promoCard]);
const schema = createSchema(blocks);
let doc = $state({ type: 'doc', content: [{ type: 'paragraph' }] });`
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
			},
		]
	};

	return { blocks, schema, attributesController, metaController, initialDocument };
}
