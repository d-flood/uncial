// Docs blocks and schema, plus the site object the route factories take. The
// site object itself is $lib/site.ts, so a block can reach it without importing
// the block registry back.
import { createBlockRegistry, createSchema } from 'uncial/core';
import { defineSvelteBlock } from 'uncial/runtime/svelte';
import Callout from '$lib/blocks/Callout.svelte';
import ImageFigure from '$lib/blocks/ImageFigure.svelte';

// Re-exported so a route takes its blocks, schema and site from one module.
export { site } from '$lib/site.js';

// Callout: a note/warning/tip admonition whose body is a flow content region.
const callout = defineSvelteBlock({
	id: 'callout',
	label: 'Callout',
	description: 'A note, warning, or tip admonition with a rich-text body.',
	attributes: {
		variant: {
			default: 'note',
			options: [
				{ value: 'note', label: 'Note' },
				{ value: 'warning', label: 'Warning' },
				{ value: 'tip', label: 'Tip' }
			]
		}
	},
	component: Callout,
	content: { kind: 'flow' }
});

// Image: an atomic figure. Its editor affordance uploads a file and stores the
// served URL as `src`; alt is required for accessibility, caption is optional.
const image = defineSvelteBlock({
	id: 'image',
	label: 'Image',
	description: 'A figure with alt text and an optional caption; upload from the editor.',
	attributes: {
		src: { default: '' },
		alt: { default: '' },
		caption: { default: '' }
	},
	component: ImageFigure
});

export const blocks = createBlockRegistry([callout, image]);

// Docs meta fields drive the sidebar (buildDocsNav): `navGroup` sections a page
// and `navOrder` sorts it within that section. Declared here so the CMS editor
// renders them in its "Edit document metadata" panel — a page's place in the nav
// is editable content, not code.
export const schema = createSchema(blocks, {
	metaFields: {
		title: { default: 'Untitled page', required: true },
		navGroup: { default: '', input: 'text', placeholder: 'Sidebar section, e.g. Getting started' },
		navOrder: { default: 0, input: 'number', placeholder: 'Sort order within the section' }
	}
});
