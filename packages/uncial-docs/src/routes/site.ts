// Docs site config, baked at build time. The docs app edits this repository
// itself: saves commit to packages/uncial-docs/content/docs/ on main. It reuses
// the existing repo-scoped auth worker unchanged (d-flood.github.io is already
// allowlisted), proving a second real site can adopt the shipped CMS with only
// build-time config.
import { createBlockRegistry, createSchema } from 'uncial/core';
import { defineSvelteBlock } from 'uncial/runtime/svelte';
import type { UncialCmsSiteConfig } from 'uncial-cms';
import { MEDIA_DIR } from '$lib/media.js';
import Callout from '$lib/blocks/Callout.svelte';
import ImageFigure from '$lib/blocks/ImageFigure.svelte';

export const siteConfig: UncialCmsSiteConfig = {
	forge: 'github',
	repo: 'd-flood/uncial',
	branch: 'main',
	contentDir: 'packages/uncial-docs/content/docs',
	authWorkerUrl: 'https://uncial-cms-auth.dflood.workers.dev',
	appSlug: 'uncial-cms',
	// Uploaded images commit here; the Image block maps a committed path to its
	// served URL (see $lib/media.ts). Kept identical to MEDIA_DIR.
	mediaDir: MEDIA_DIR
};

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

// FS location of the content dir at build time, relative to the package root
// (vite runs from there). config.contentDir is the same dir repo-root-relative.
export const localContentDir = 'content/docs';
