/**
 * `uncial-cms/vite` — the plugins a site installs from its Vite config. Node
 * only: it resolves paths on disk and imports Vite's own types.
 */
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { createLocalVitePlugin } from '../local/vite.js';
import type { SiteOptions } from '../define-site.js';

/**
 * The forge the build targets, as a string literal in the bundle. An editor
 * page gates on it statically so a local-only production build drops the whole
 * editor stack rather than merely leaving it unrouted.
 */
export const FORGE_DEFINE_KEY = 'import.meta.env.UNCIAL_CMS_FORGE';

/**
 * The repository root the forge's paths are relative to. A site already declares
 * the one pair of facts that fixes it: `contentDir` names the content directory
 * from the repository root, `localContentDir` names the same directory on disk,
 * so stripping the former's segments off the latter leaves the root above both.
 */
function repositoryRoot(options: SiteOptions): string {
	const contentDir = trimSlashes(options.contentDir);
	const local = resolve(options.localContentDir ?? options.contentDir);
	const depth = contentDir === '' ? 0 : contentDir.split('/').length;
	const root = resolve(local, ...Array.from({ length: depth }, () => '..'));
	if (resolve(root, contentDir) !== local) {
		throw new Error(
			`localContentDir must be where contentDir sits on disk: "${local}" does not end with "${contentDir}".`
		);
	}
	return root;
}

function trimSlashes(path: string): string {
	return path.replace(/^\/+|\/+$/g, '');
}

function localPlugin(options: SiteOptions): Plugin {
	if (options.localMediaDir === undefined) {
		return createLocalVitePlugin({
			root: repositoryRoot(options),
			permittedRoots: [
				trimSlashes(options.contentDir),
				...(options.mediaDir ? [trimSlashes(options.mediaDir)] : [])
			]
		});
	}
	if (!options.mediaDir)
		throw new Error('localMediaDir needs the mediaDir it is the local copy of.');
	return createLocalVitePlugin({
		root: resolve(options.localContentDir ?? options.contentDir),
		permittedRoots: [
			{ path: options.contentDir, local: options.localContentDir ?? options.contentDir },
			{ path: options.mediaDir, local: options.localMediaDir }
		]
	});
}

export function uncialCms(options: SiteOptions): Plugin[] {
	return [
		localPlugin(options),
		{
			name: 'uncial-cms:forge',
			config(_config, env) {
				const forge =
					env.command === 'serve' ? 'local' : options.github !== undefined ? 'github' : 'none';
				return { define: { [FORGE_DEFINE_KEY]: JSON.stringify(forge) } };
			}
		}
	];
}
