// The docs Site object, resolved for the current build: the local checkout while
// developing, GitHub in the production build.
import { base } from '$app/paths';
import { defineSite } from 'uncial-cms';
import { siteOptions } from '../../site.options.js';

// `navGroup` sections a page in the sidebar (buildNav) and `navOrder` sorts it
// within that section, so a page's place in the nav is editable content.
export const site = defineSite(siteOptions, {
	base,
	blocks: import.meta.glob('../lib/blocks/*.svelte', { eager: true }),
	templates: import.meta.glob('../lib/templates/*.svelte', { eager: true }),
	meta: {
		title: { default: 'Untitled page', required: true },
		navGroup: { default: '', input: 'text', placeholder: 'Sidebar section, e.g. Getting started' },
		navOrder: { default: 0, input: 'number', placeholder: 'Sort order within the section' }
	}
});
