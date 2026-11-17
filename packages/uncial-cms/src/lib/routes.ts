/**
 * The content-directory reads behind both frameworks' route factories. Build
 * and server time only: it reads the local content directory with node:fs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ContentDocument } from 'uncial';
import { listContentSources } from './content-sources.js';
import type { MetaOf, Site } from './define-site.js';
import { defaultMapSourceToPath } from './paths/index.js';
import { isCollectionSource, isGlobalsPath } from './record-paths.js';

/** A content file as the factories see it: site-relative path, repo-root-relative source. */
export interface ContentEntry {
	path: string;
	source: string;
}

/** A content document ready to render, with the paths an editor route needs. */
export interface ContentPage<Meta extends Record<string, unknown> = Record<string, unknown>> {
	path: string;
	/** Repo-root-relative, as the forge addresses it. */
	sourcePath: string;
	document: ContentDocument;
	meta: Meta;
}

export interface RouteOptions {
	exclude?: (entry: ContentEntry) => boolean;
}

function normalizePagePath(path: string | undefined): string {
	return (path ?? '').replace(/^\/+/, '').replace(/\/+$/, '');
}

function memoize<T>(read: () => T): () => T {
	let cached: { value: T } | undefined;
	return () => {
		if (import.meta.env.DEV) return read();
		return (cached ??= { value: read() }).value;
	};
}

export function contentSource<S extends Site>(site: S, options: RouteOptions = {}) {
	const { config, localContentDir } = site;
	if (config.forge === 'server') {
		throw new Error(
			'These route factories read a content directory; a server site serves its content through createServerContentHandlers.'
		);
	}
	const { contentDir } = config;
	const entries = memoize(() =>
		listContentSources(localContentDir)
			.map((rel): ContentEntry => {
				const source = `${contentDir}/${rel}`;
				return { path: defaultMapSourceToPath(source, contentDir), source };
			})
			.filter(
				(entry) =>
					!isGlobalsPath(entry.path) &&
					!isCollectionSource(site, entry.source) &&
					!(options.exclude?.(entry) ?? false)
			)
	);
	const read = ({ path, source }: ContentEntry): ContentPage<MetaOf<S>> => {
		const raw = readFileSync(join(localContentDir, source.slice(contentDir.length + 1)), 'utf-8');
		const document = site.normalize(JSON.parse(raw) as Partial<ContentDocument>);
		return { path, sourcePath: source, document, meta: (document.meta ?? {}) as MetaOf<S> };
	};
	return {
		entries,
		list: memoize(() => entries().map(read)),
		read,
		/** The entry a requested path names, or undefined when no page lives there. */
		find: (requested: string | undefined): ContentEntry | undefined => {
			const path = normalizePagePath(requested);
			return entries().find((entry) => entry.path === path);
		}
	};
}
