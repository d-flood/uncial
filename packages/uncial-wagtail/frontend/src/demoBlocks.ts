import { defineSvelteBlock, hasRichTextContent, richTextDocument } from 'uncial';

import Callout from './Callout.svelte';
import Card from './Card.svelte';

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

export function createCalloutBlock() {
	return defineSvelteBlock({
		id: 'callout',
		label: 'Callout',
		description: 'Tone-tinted notice with a rich text body.',
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
				default: richTextDocument('Callouts support bold and italic.'),
				input: 'richtext',
				richText: { features: ['bold', 'italic'] },
				validate: hasRichTextContent
			},
			showIcon: true
		},
		component: Callout
	});
}

export function createCardBlock() {
	return defineSvelteBlock({
		id: 'card',
		label: 'Card',
		description: 'Compact editorial card with rich text content.',
		attributes: {
			title: { default: 'Launch checklist', required: true, validate: isNonEmptyString },
			subtitle: 'A compact Wagtail block',
			body: {
				default: richTextDocument('Cards use rich text for author-editable body copy.'),
				input: 'richtext',
				richText: { features: ['bold', 'italic', 'bulletList', 'orderedList'] },
				validate: hasRichTextContent
			}
		},
		component: Card
	});
}
