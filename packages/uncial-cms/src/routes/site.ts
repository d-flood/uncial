// Demo site config, baked at build time (PRD D9). The demo edits this
// repository itself: saves commit to packages/uncial-cms/content/ on main.
import { createBlockRegistry, createSchema } from 'uncial/core';
import type { UncialCmsSiteConfig } from '$lib/types.js';

export const siteConfig: UncialCmsSiteConfig = {
	forge: 'github',
	repo: 'd-flood/uncial',
	branch: 'main',
	contentDir: 'packages/uncial-cms/content',
	authWorkerUrl: '', // placeholder until the auth worker ships (issue 03)
	appSlug: 'uncial-cms'
};

export const blocks = createBlockRegistry([]);

export const schema = createSchema(blocks, {
	metaFields: {
		title: { default: 'Untitled page', required: true }
	}
});

// FS location of the content dir at build time, relative to the package root
// (vite runs from there). config.contentDir is the same dir repo-root-relative.
export const localContentDir = 'content';
