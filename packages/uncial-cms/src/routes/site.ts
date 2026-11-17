// The demo's Site object. It edits this repository itself: saves commit to
// packages/uncial-cms/content/ and packages/uncial-cms/states/ on main.
import { base } from '$app/paths';
import { defineMark } from 'uncial';
import { defineSite } from '$lib/index.js';
import SmallCaps from './SmallCaps.svelte';

const sitePath = (value: unknown) => typeof value === 'string' && value.startsWith('/');
const link = {
	itemLabel: 'link',
	fields: {
		label: { default: '', required: true },
		href: { default: '/', required: true, validate: sitePath }
	}
};

const siteOptions = {
	contentDir: 'packages/uncial-cms/content',
	// The same dir relative to the package root, where vite runs.
	localContentDir: 'content',
	staticDir: 'packages/uncial-cms/static',
	mediaDir: 'packages/uncial-cms/static/uploads',
	github: { repo: 'd-flood/uncial', branch: 'main' },
	globals: {
		footer: {
			label: 'Site footer',
			meta: {
				note: { default: '' },
				columns: {
					default: [],
					list: {
						itemLabel: 'column',
						fields: {
							heading: { default: '', required: true },
							links: { default: [], list: link }
						}
					}
				}
			}
		}
	},
	collections: {
		states: {
			dir: 'packages/uncial-cms/states',
			label: 'States',
			meta: { name: { default: '', required: true }, capital: { default: '' } }
		}
	}
};

export const site = defineSite(siteOptions, {
	base,
	blocks: [],
	marks: [
		defineMark({
			id: 'smallCaps',
			extension: () => import('./small-caps.js'),
			component: SmallCaps,
			toolbar: { label: 'Small caps' }
		})
	],
	meta: { title: { default: 'Untitled page', required: true } }
});
