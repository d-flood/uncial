/**
 * `uncial-cms/astro` — the integration and route helpers for a static Astro
 * site. Build time only: it reads the local content directory with node:fs, so
 * import it from `astro.config` and route frontmatter, never from an island.
 * The editor island lives at `uncial-cms/astro/editor`.
 *
 * Like `uncial-cms/sveltekit`, nothing here registers a route. The host writes
 * its reader route as `[...path].astro` and injects or writes its editor route
 * itself, and each hands its `getStaticPaths` to the helper.
 *
 * The helpers take the site's plain options rather than `defineSite`'s result
 * so that no reader route has to import the package root: the root carries the
 * editor's stylesheet, and Astro links a module's CSS into every page whose
 * graph reaches it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeDocument } from 'uncial/core';
import type { BlockRegistry, ContentDocument, ContentSchema } from 'uncial/core';
import { listContentSources } from '../content-sources.js';
import type { SiteOptions } from '../define-site.js';
import { defaultMapPathToSource, defaultMapSourceToPath } from '../paths/index.js';

export { uncialCms } from './integration.js';

/** A content file as the helpers see it: site-relative path, repo-root-relative source. */
export interface ContentEntry {
	path: string;
	source: string;
}

/** A content document ready to render, with the paths an editor route needs. */
export interface ContentPage {
	path: string;
	/** Repo-root-relative, as the forge addresses it. */
	sourcePath: string;
	document: ContentDocument;
}

export interface ContentRouteOptions {
	/** The options the site hands `defineSite`. */
	siteOptions: SiteOptions;
	blocks: BlockRegistry;
	/** One schema for the whole site, or the schema this page path is written against. */
	schema: ContentSchema | ((path: string) => ContentSchema);
	/** Keep a non-page file — site settings, a manifest — out of the routes. */
	exclude?: (entry: ContentEntry) => boolean;
}

/**
 * A rest parameter's value: Astro spells the site root as `undefined`, which a
 * `[...path]` route needs in order to emit `/`.
 */
type RestParams = { path: string | undefined };

function localContentDir({ siteOptions }: ContentRouteOptions): string {
	return siteOptions.localContentDir ?? siteOptions.contentDir;
}

function listEntries(opts: ContentRouteOptions): ContentEntry[] {
	const { contentDir } = opts.siteOptions;
	return listContentSources(localContentDir(opts))
		.map((rel) => {
			const source = `${contentDir}/${rel}`;
			return { path: defaultMapSourceToPath(source, contentDir), source };
		})
		.filter((entry) => !opts.exclude?.(entry));
}

function readPage(opts: ContentRouteOptions, { path, source }: ContentEntry): ContentPage {
	const rel = source.slice(opts.siteOptions.contentDir.length + 1);
	const raw = JSON.parse(readFileSync(join(localContentDir(opts), rel), 'utf-8'));
	const schema = typeof opts.schema === 'function' ? opts.schema(path) : opts.schema;
	return {
		path,
		sourcePath: source,
		document: normalizeDocument(raw as Partial<ContentDocument>, opts.blocks, schema)
	};
}

function restParams(path: string): RestParams {
	return { path: path === '' ? undefined : path };
}

export function createContentRoutes(opts: ContentRouteOptions): {
	/** Every content document, normalized, in source order. */
	list: () => ContentPage[];
	/** One document by site path, for a route with a fixed shell of its own. */
	load: (path: string) => ContentPage;
	getStaticPaths: () => Array<{ params: RestParams; props: ContentPage }>;
} {
	const list = () => listEntries(opts).map((entry) => readPage(opts, entry));
	return {
		list,
		load: (path) => {
			const source = defaultMapPathToSource(path, opts.siteOptions.contentDir);
			if (opts.exclude?.({ path, source })) {
				throw new Error(`Content path "${path}" is excluded from this site's routes.`);
			}
			return readPage(opts, { path, source });
		},
		getStaticPaths: () => list().map((page) => ({ params: restParams(page.path), props: page }))
	};
}

export function createEditorRoutes(opts: ContentRouteOptions & { devOnly?: boolean }): {
	// The document itself is never baked into an editor route: the island loads
	// it live from the forge, so an editor always starts from the latest commit.
	getStaticPaths: () => Array<{ params: RestParams; props: { sourcePath: string; pagePath: string } }>;
} {
	// A local-only site has no forge to commit to outside development.
	const devOnly = opts.devOnly ?? opts.siteOptions.github === undefined;
	return {
		getStaticPaths: () =>
			devOnly && !import.meta.env.DEV
				? []
				: listEntries(opts).map(({ path, source }) => ({
						params: restParams(path),
						props: { sourcePath: source, pagePath: path }
					}))
	};
}
