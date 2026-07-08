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
import type { UncialCmsSiteConfig } from '../types.js';
import { defaultMapPathToSource, defaultMapSourceToPath } from './mapping.js';

export { defaultMapPathToSource, defaultMapSourceToPath } from './mapping.js';

export interface ContentHandlerOptions {
	config: UncialCmsSiteConfig;
	blocks: unknown;
	schema: unknown;
	/** FS path of the content dir at build time (differs from config.contentDir,
	 * which is repo-root-relative for the forge API). */
	localContentDir: string;
	/** Site-relative URL path → repo-root-relative JSON path. */
	mapPathToSource?: (path: string) => string;
}

export type IndexHandlerOptions = Omit<ContentHandlerOptions, 'localContentDir'>;

interface RouteEntry {
	path: string;
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

function createEntries(opts: ContentHandlerOptions): () => RouteEntry[] {
	return () =>
		listContentSources(opts.localContentDir).map((rel) => ({
			path: defaultMapSourceToPath(`${opts.config.contentDir}/${rel}`, opts.config.contentDir)
		}));
}

function resolveSource(opts: ContentHandlerOptions, sitePath: string): string {
	const map =
		opts.mapPathToSource ?? ((path: string) => defaultMapPathToSource(path, opts.config.contentDir));
	return map(sitePath);
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
	}) => Promise<{ document: ContentDocument; meta: Record<string, unknown> }>;
} {
	const blocks = opts.blocks as BlockRegistry;
	const schema = opts.schema as ContentSchema;
	return {
		entries: createEntries(opts),
		load: async ({ params }) => {
			const source = resolveSource(opts, params.path);
			const rel = contentDirRelative(source, opts.config.contentDir);
			const raw = readFileSync(join(opts.localContentDir, rel), 'utf-8');
			const document = normalizeDocument(
				JSON.parse(raw) as Partial<ContentDocument>,
				blocks,
				schema
			);
			return { document, meta: document.meta ?? {} };
		}
	};
}

export function createEditorHandlers(opts: ContentHandlerOptions): {
	entries: () => RouteEntry[];
	// Bakes the mapping only (PRD D9); document data is NEVER baked — the edit
	// page component fetches it live from the forge via mountEditorPage().
	load: (event: { params: { path: string } }) => Promise<{ sourcePath: string; path: string }>;
} {
	return {
		entries: createEntries(opts),
		load: async ({ params }) => ({
			sourcePath: resolveSource(opts, params.path),
			path: params.path
		})
	};
}

export function createIndexHandlers(opts: IndexHandlerOptions): {
	// '/uncial/' shell: session status + placeholder nav; create/delete and the
	// fallback editor arrive in a later slice (issue 04).
	load: () => Promise<{ config: UncialCmsSiteConfig }>;
} {
	return {
		load: async () => ({ config: opts.config })
	};
}
