import svelte from '@astrojs/svelte';
import { defineConfig } from 'astro/config';
import { uncialAliases } from '../../vite.config.ts';
// The integration's own module: the subpath's entry also loads uncial/core,
// which the aliases below only resolve once the config is loaded.
import { uncialCms } from '../../src/lib/astro/integration.ts';
import { siteOptions } from './src/site-options.ts';

const src = (path: string) => new URL(`../../src/lib/${path}`, import.meta.url).pathname;

export default defineConfig({
	outDir: '../../.e2e-build/astro',
	integrations: [svelte(), uncialCms(siteOptions)],
	vite: {
		resolve: {
			alias: [
				...uncialAliases,
				{ find: 'uncial-cms/astro/editor', replacement: src('astro/editor.ts') },
				{ find: 'uncial-cms/astro', replacement: src('astro/index.ts') },
				{ find: /^uncial-cms$/, replacement: src('index.ts') }
			]
		}
	}
});
