// The fixture's one site declaration. The GitHub half is inlined by the Vite
// config (see UNCIAL_FIXTURE_GITHUB there) so that one env var switches the
// fixture between a local-only site and a GitHub one.
import { createBlockRegistry, createSchema } from 'uncial/core';
import { defineSite } from 'uncial-cms';

export const site = defineSite({
	contentDir: 'content',
	github: import.meta.env.UNCIAL_FIXTURE_GITHUB
		? { repo: 'uncial-fixture/site', branch: 'main' }
		: undefined
});

export const blocks = createBlockRegistry([]);

export const schema = createSchema(blocks, {
	metaFields: { title: { default: 'Untitled page', required: true } }
});
