/**
 * `uncial-cms/vite` — the plugins a site installs from its Vite config. Node
 * only: it resolves paths on disk and imports Vite's own types.
 */
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { repositoryRoot } from '../repository-root.js';
import { createLocalVitePlugin } from '../local/vite.js';
import type { SiteOptions } from '../define-site.js';
import { mediaPlugin } from './media.js';

/**
 * The forge the build targets, as a string literal in the bundle. An editor
 * page gates on it statically so a local-only production build drops the whole
 * editor stack rather than merely leaving it unrouted.
 */
const FORGE_DEFINE_KEY = 'import.meta.env.UNCIAL_CMS_FORGE';

function trimSlashes(path: string): string {
	return path.replace(/^\/+|\/+$/g, '');
}

export interface UncialCmsPluginOptions {
	/** The site module, from the Vite root; its `site` export's content declares the renditions to write. */
	site?: string;
	/** The dev server's `server.host`; loopback by default, because the local endpoint has no auth. */
	host?: string | boolean;
}

function localPlugin(
	options: SiteOptions,
	{ host }: UncialCmsPluginOptions,
	onWrite?: () => void
): Plugin {
	const root = () => repositoryRoot(options.contentDir, options.localContentDir);
	const collectionDirs = Object.values(options.collections ?? {}).map(({ dir }) =>
		trimSlashes(dir)
	);
	if (options.localMediaDir === undefined) {
		return createLocalVitePlugin({
			host,
			onWrite,
			root: root(),
			permittedRoots: [
				trimSlashes(options.contentDir),
				...(options.mediaDir ? [trimSlashes(options.mediaDir)] : []),
				...collectionDirs
			]
		});
	}
	if (!options.mediaDir)
		throw new Error('localMediaDir needs the mediaDir it is the local copy of.');
	return createLocalVitePlugin({
		host,
		onWrite,
		root: resolve(options.localContentDir ?? options.contentDir),
		permittedRoots: [
			{ path: options.contentDir, local: options.localContentDir ?? options.contentDir },
			{ path: options.mediaDir, local: options.localMediaDir },
			...collectionDirs.map((dir) => ({ path: dir, local: resolve(root(), dir) }))
		]
	});
}

export function uncialCms(options: SiteOptions, plugin: UncialCmsPluginOptions = {}): Plugin[] {
	const media = mediaPlugin(options, plugin.site);
	return [
		localPlugin(options, plugin, media?.contentChanged),
		{
			name: 'uncial-cms:forge',
			config(_config, env) {
				const forge =
					env.command === 'serve' ? 'local' : options.github !== undefined ? 'github' : 'none';
				return { define: { [FORGE_DEFINE_KEY]: JSON.stringify(forge) } };
			}
		},
		...(media ? [media.plugin] : [])
	];
}
