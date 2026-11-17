/**
 * Where Globals and Collection records live, kept free of runtime `uncial`
 * imports so that `uncial-cms/astro` loads in plain Node.
 */
import type { Site } from './define-site.js';
import type { UncialCmsSiteConfig } from './types.js';

export const GLOBALS_DIR = '_globals';

export function isGlobalsPath(path: string): boolean {
	return path.replace(/^\/+/, '').split('/')[0] === GLOBALS_DIR;
}

export const trimSlashes = (path: string) => path.replace(/^\/+|\/+$/g, '');

/** Where a record of `dir` is stored: a repo-root-relative file, or a path in the server store. */
export function collectionRecordPath(config: UncialCmsSiteConfig, dir: string, slug: string) {
	return config.forge === 'server'
		? `/${trimSlashes(dir)}/${slug}/`
		: `${trimSlashes(dir)}/${slug}.json`;
}

export function collectionSlug(
	config: UncialCmsSiteConfig,
	dir: string,
	source: string
): string | undefined {
	const prefix = config.forge === 'server' ? `/${trimSlashes(dir)}/` : `${trimSlashes(dir)}/`;
	if (!source.startsWith(prefix)) return undefined;
	const rest = source.slice(prefix.length);
	if (config.forge === 'server') return trimSlashes(rest) || undefined;
	return rest.endsWith('.json') ? rest.slice(0, -'.json'.length) : undefined;
}

/** True when `source` (a repo-root-relative file or a server store path) is a Collection record. */
export function isCollectionSource(site: Pick<Site, 'config' | 'collections'>, source: string) {
	return Object.values(site.collections).some(
		({ dir }) => collectionSlug(site.config, dir, source) !== undefined
	);
}
