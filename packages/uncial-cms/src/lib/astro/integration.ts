import type { AstroIntegration, ViteUserConfig } from 'astro';
import type { SiteOptions } from '../define-site.js';
import { uncialCms as uncialCmsVite } from '../vite/index.js';

/** Installs the dev server's local forge and the build's forge constant. */
export function uncialCms(options: SiteOptions): AstroIntegration {
	return {
		name: 'uncial-cms',
		hooks: {
			'astro:config:setup': ({ updateConfig }) => {
				// Typed against the Vite this package builds with, which need not be
				// the one Astro bundles; the plugins use only hooks both versions share.
				const plugins = uncialCmsVite(options) as NonNullable<ViteUserConfig['plugins']>;
				updateConfig({ vite: { plugins } });
			}
		}
	};
}
