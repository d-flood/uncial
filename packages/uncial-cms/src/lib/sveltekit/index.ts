/**
 * `uncial-cms/sveltekit` — route factories for prerendered SvelteKit sites.
 * `@sveltejs/kit` is a peer of this subpath only. It runs at build time and
 * reads the local content directory with node:fs, so keep it out of client code.
 */
import { error } from '@sveltejs/kit';
import type { ContentDocument } from 'uncial';
import type { MetaOf, Site } from '../define-site.js';
import { contentSource, type ContentPage, type RouteOptions } from '../routes.js';

export type { MetaOf } from '../define-site.js';
export type { ContentEntry, ContentPage, RouteOptions } from '../routes.js';

/** One route per content document; `load` 404s a path no page lives at. */
export function contentRoutes<S extends Site>(
	site: S,
	options: RouteOptions = {}
): {
	entries: () => RouteEntry[];
	list: () => ContentPage<MetaOf<S>>[];
	load: (event: {
		params: { path: string };
	}) => Promise<{ document: ContentDocument; meta: MetaOf<S>; path: string }>;
} {
	const source = contentSource(site, options);
	return {
		entries: () => source.entries().map(({ path }) => ({ path })),
		/** Every content document, normalized, in source order. */
		list: source.list,
		load: async ({ params }) => {
			const entry = source.find(params.path);
			if (!entry) error(404, 'Not found');
			const { document, meta, path } = source.read(entry);
			return { document, meta, path };
		}
	};
}

/** The Editor variant of every content route. The document is never baked: the editor loads it live. */
export function editorRoutes(
	site: Site,
	options: RouteOptions = {}
): {
	entries: () => RouteEntry[];
	load: (event: { params: { path: string } }) => Promise<{ sourcePath: string; pagePath: string }>;
} {
	const source = contentSource(site, options);
	return {
		// A local-only site has no forge to commit to outside development, and an
		// empty list prerenders no editor pages.
		entries: () =>
			site.localOnly && !import.meta.env.DEV ? [] : source.entries().map(({ path }) => ({ path })),
		load: async ({ params }) => {
			const entry = source.find(params.path);
			if (!entry) error(404, 'Not found');
			return { sourcePath: entry.source, pagePath: entry.path };
		}
	};
}

interface RouteEntry {
	path: string;
}
