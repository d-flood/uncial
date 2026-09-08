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

export function uncialCms(options: SiteOptions): Plugin[] {
	return [
		createLocalVitePlugin({ contentDir: resolve(options.localContentDir ?? options.contentDir) }),
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
