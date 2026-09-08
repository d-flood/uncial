/**
 * `uncial-cms/sveltekit` — route factories for prerendered SvelteKit sites.
 * `@sveltejs/kit` and `svelte` are peers of this subpath ONLY; the runtime
 * root must not import them. This module runs at build time (prerender) and
 * reads the local content directory with node:fs — do not import it from
 * client-side code (the pure mapping lives in `./mapping.js` for that).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeDocument } from 'uncial/core';
import type { BlockRegistry, ContentDocument, ContentSchema } from 'uncial/core';
import type { Site } from '../define-site.js';
import type { UncialCmsSiteConfig } from '../types.js';
import { defaultMapPathToSource, defaultMapSourceToPath } from '../paths/index.js';

export { defaultMapPathToSource, defaultMapSourceToPath } from '../paths/index.js';

/** A content file as the factories see it: site-relative path, repo-root-relative source. */
export interface ContentEntry {
	path: string;
	source: string;
}

interface HandlerOptionsBase {
	blocks: BlockRegistry;
	/** One schema for the whole site, or the schema this page path is written against. */
	schema: ContentSchema | ((path: string) => ContentSchema);
	/** Site-relative URL path → repo-root-relative JSON path. */
	mapPathToSource?: (path: string) => string;
	/** Keep a non-page file — site settings, a manifest — out of the routes. */
	exclude?: (entry: ContentEntry) => boolean;
}

/** The site object from `defineSite`, or the resolved config plus its build-time FS path. */
interface SiteSource {
	site: Site;
	config?: never;
	localContentDir?: never;
}

interface ConfigSource {
	site?: never;
	config: UncialCmsSiteConfig;
	/** FS path of the content dir at build time (differs from config.contentDir,
	 * which is repo-root-relative for the forge API). */
	localContentDir: string;
}

export type ContentHandlerOptions = HandlerOptionsBase & (SiteSource | ConfigSource);

export type IndexHandlerOptions = HandlerOptionsBase &
	(SiteSource | (Omit<ConfigSource, 'localContentDir'> & { localContentDir?: string }));

interface RouteEntry {
	path: string;
}

interface ResolvedSite {
	config: UncialCmsSiteConfig;
	localContentDir: string;
	localOnly: boolean;
}

function resolveSite(opts: ContentHandlerOptions): ResolvedSite {
	if (opts.site) {
		return {
			config: opts.site.config,
			localContentDir: opts.site.localContentDir,
			localOnly: opts.site.localOnly
		};
	}
	return { config: opts.config, localContentDir: opts.localContentDir, localOnly: false };
}

function listContentSources(localContentDir: string, prefix = ''): string[] {
	const sources: string[] = [];
	for (const entry of readdirSync(join(localContentDir, prefix), { withFileTypes: true })) {
		const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
		if (entry.isDirectory()) sources.push(...listContentSources(localContentDir, rel));
		else if (entry.isFile() && entry.name.endsWith('.json')) sources.push(rel);
	}
	return sources.sort();
}

function createEntries(opts: ContentHandlerOptions, site: ResolvedSite): () => RouteEntry[] {
	return () =>
		listContentSources(site.localContentDir)
			.map((rel) => {
				const source = `${site.config.contentDir}/${rel}`;
				return { path: defaultMapSourceToPath(source, site.config.contentDir), source };
			})
			.filter((entry) => !opts.exclude?.(entry))
			.map(({ path }) => ({ path }));
}

/** The source for a site path, refusing one the site's `exclude` rules out. */
function resolveSource(
	opts: ContentHandlerOptions,
	site: ResolvedSite,
	sitePath: string
): string {
	const map =
		opts.mapPathToSource ?? ((path: string) => defaultMapPathToSource(path, site.config.contentDir));
	const source = map(sitePath);
	if (opts.exclude?.({ path: sitePath, source })) {
		throw new Error(`Content path "${sitePath}" is excluded from this site's routes.`);
	}
	return source;
}

function schemaFor(opts: HandlerOptionsBase, path: string): ContentSchema {
	return typeof opts.schema === 'function' ? opts.schema(path) : opts.schema;
}

/** Repo-root-relative source → path relative to the content dir (for local FS reads). */
function contentDirRelative(source: string, contentDir: string): string {
	const prefix = `${contentDir}/`;
	if (!source.startsWith(prefix)) {
		throw new Error(`Source "${source}" is outside the content dir "${contentDir}".`);
	}
	return source.slice(prefix.length);
}

export function createContentHandlers(opts: ContentHandlerOptions): {
	entries: () => RouteEntry[];
	load: (event: {
		params: { path: string };
	}) => Promise<{ document: ContentDocument; meta: Record<string, unknown>; path: string }>;
} {
	const site = resolveSite(opts);
	return {
		entries: createEntries(opts, site),
		load: async ({ params }) => {
			const source = resolveSource(opts, site, params.path);
			const rel = contentDirRelative(source, site.config.contentDir);
			const raw = readFileSync(join(site.localContentDir, rel), 'utf-8');
			const document = normalizeDocument(
				JSON.parse(raw) as Partial<ContentDocument>,
				opts.blocks,
				schemaFor(opts, params.path)
			);
			return { document, meta: document.meta ?? {}, path: params.path };
		}
	};
}

export function createEditorHandlers(opts: ContentHandlerOptions & { devOnly?: boolean }): {
	entries: () => RouteEntry[];
	// Bakes the mapping only (PRD D9); document data is NEVER baked — the edit
	// page component fetches it live from the forge via mountEditorPage().
	load: (event: { params: { path: string } }) => Promise<{ sourcePath: string; pagePath: string }>;
} {
	const site = resolveSite(opts);
	// A local-only site has no forge to commit to outside development, so its
	// editor variants are development-only without anyone saying so.
	const devOnly = opts.devOnly ?? site.localOnly;
	const entries = createEntries(opts, site);
	return {
		// Prerendering a dynamic route walks `entries`: an empty list emits no editor pages.
		// These routes are unlinked, so strict builds do not encounter them, while development
		// servers still serve them on demand.
		entries: () => (devOnly && !import.meta.env.DEV ? [] : entries()),
		load: async ({ params }) => ({
			sourcePath: resolveSource(opts, site, params.path),
			pagePath: params.path
		})
	};
}

export function createIndexHandlers(opts: IndexHandlerOptions): {
	// '/uncial/' shell: session status + placeholder nav; create/delete and the
	// fallback editor arrive in a later slice (issue 04).
	load: () => Promise<{ config: UncialCmsSiteConfig }>;
} {
	const config = opts.site ? opts.site.config : opts.config;
	return {
		load: async () => ({ config })
	};
}
