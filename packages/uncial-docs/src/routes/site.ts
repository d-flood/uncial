// Docs site config, baked at build time. The docs app edits this repository
// itself: saves commit to packages/uncial-docs/content/docs/ on main. It reuses
// the existing repo-scoped auth worker unchanged (d-flood.github.io is already
// allowlisted), proving a second real site can adopt the shipped CMS with only
// build-time config.
import { createBlockRegistry, createSchema } from 'uncial/core';
import type { UncialCmsSiteConfig } from 'uncial-cms';

export const siteConfig: UncialCmsSiteConfig = {
	forge: 'github',
	repo: 'd-flood/uncial',
	branch: 'main',
	contentDir: 'packages/uncial-docs/content/docs',
	authWorkerUrl: 'https://uncial-cms-auth.dflood.workers.dev',
	appSlug: 'uncial-cms'
};

// Built-in blocks only for now; Callout/Image custom blocks arrive in ticket 04.
export const blocks = createBlockRegistry([]);

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

// FS location of the content dir at build time, relative to the package root
// (vite runs from there). config.contentDir is the same dir repo-root-relative.
export const localContentDir = 'content/docs';
