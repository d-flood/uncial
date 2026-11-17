/**
 * `uncial-cms/astro` — the integration and route helpers for a static Astro
 * site. Build time only: it reads the local content directory with node:fs, so
 * import it from `astro.config` and route frontmatter, never from an island.
 * The editor island lives at `uncial-cms/astro/editor`.
 *
 * The host writes its reader route as `[...path].astro`; the integration injects
 * the Editor variant and Dashboard routes when given the site module and a layout.
 */
import type { Site } from '../define-site.js';
import { contentSource, type ContentEntry, type RouteOptions } from '../routes.js';

export { uncialCms } from './integration.js';
export type { MetaOf } from '../define-site.js';
export type { ContentEntry, ContentPage, RouteOptions } from '../routes.js';

/**
 * A rest parameter's value: Astro spells the site root as `undefined`, which a
 * `[...path]` route needs in order to emit `/`.
 */
type RestParams = { path: string | undefined };

function restParams(path: string): RestParams {
	return { path: path === '' ? undefined : path };
}

/** One route per content document; `load` returns undefined for a path no page lives at. */
export function contentRoutes<S extends Site>(site: S, options: RouteOptions = {}) {
	const source = contentSource(site, options);
	return {
		/** Every content document, normalized, in source order. */
		list: source.list,
		load: (path: string | undefined) => {
			const entry = source.find(path);
			return entry && source.read(entry);
		},
		getStaticPaths: () =>
			source.list().map((page) => ({ params: restParams(page.path), props: page }))
	};
}

/** The Editor variant of every content route. The document is never baked: the island loads it live. */
export function editorRoutes(site: Site, options: RouteOptions = {}) {
	const source = contentSource(site, options);
	const props = (entry: ContentEntry) => ({ sourcePath: entry.source, pagePath: entry.path });
	return {
		load: (path: string | undefined) => {
			const entry = source.find(path);
			return entry && props(entry);
		},
		// A local-only site has no forge to commit to outside development.
		getStaticPaths: () =>
			site.localOnly && !import.meta.env.DEV
				? []
				: source.entries().map((entry) => ({ params: restParams(entry.path), props: props(entry) }))
	};
}
