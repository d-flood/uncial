// Demo site config, baked at build time (PRD D9). The demo edits this
// repository itself: saves commit to packages/uncial-cms/content/ on main.
import { createBlockRegistry, createSchema } from 'uncial/core';
import type { UncialCmsSiteConfig } from '$lib/types.js';

export const siteConfig: UncialCmsSiteConfig = {
	forge: 'github',
	repo: 'd-flood/uncial',
	branch: 'main',
	contentDir: 'packages/uncial-cms/content',
	authWorkerUrl: 'https://uncial-cms-auth.dflood.workers.dev',
	appSlug: 'uncial-cms',
	mediaDir: 'packages/uncial-cms/static/uploads'
};

export const blocks = createBlockRegistry([]);

export const schema = createSchema(blocks, {
	metaFields: {
		title: { default: 'Untitled page', required: true }
	}
});

const sitePath = (value: unknown) => typeof value === 'string' && value.startsWith('/');
const link = {
	itemLabel: 'link',
	fields: {
		label: { default: '', required: true },
		href: { default: '/', required: true, validate: sitePath }
	}
};

export const globals = {
	footer: {
		...createSchema(blocks, {
			metaFields: {
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
		}),
		title: 'Site footer'
	}
};

// FS location of the content dir at build time, relative to the package root
// (vite runs from there). config.contentDir is the same dir repo-root-relative.
export const localContentDir = 'content';

export const staticDir = 'packages/uncial-cms/static';
