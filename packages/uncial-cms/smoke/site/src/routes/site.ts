// Blocks, schema and the site object the route factories take. Imports nothing
// but the published entrypoints: `uncial/core`, `uncial/runtime/svelte` and
// `uncial-cms`.
import { createBlockRegistry, createSchema } from 'uncial/core';
import { defineSvelteBlock } from 'uncial/runtime/svelte';
import { defineSite } from 'uncial-cms';
import Note from '$lib/Note.svelte';
import { siteOptions } from '../../site.options.js';

export { STATIC_DIR } from '../../site.options.js';

export const site = defineSite(siteOptions);

const note = defineSvelteBlock({
	id: 'note',
	label: 'Note',
	description: 'An admonition whose body is a flow content region.',
	attributes: {},
	component: Note,
	content: { kind: 'flow' }
});

export const blocks = createBlockRegistry([note]);

export const schema = createSchema(blocks, {
	metaFields: { title: { default: 'Untitled page', required: true } }
});
