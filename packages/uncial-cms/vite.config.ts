import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// Resolve uncial's subpath exports from workspace source (same pattern as
// uncial-wagtail): the published exports point at packages/uncial/dist, which
// does not exist on a fresh checkout (CI builds the docs site, not the lib).
const uncialSrc = (path: string) => new URL(`../uncial/src/lib/${path}`, import.meta.url).pathname;

export const uncialAliases = [
	{ find: 'uncial/styles', replacement: uncialSrc('styles/index.css') },
	{ find: 'uncial/core', replacement: uncialSrc('core/index.ts') },
	{ find: 'uncial/render', replacement: uncialSrc('render/index.ts') },
	{ find: 'uncial/editor', replacement: uncialSrc('editor/index.ts') },
	{ find: 'uncial/runtime/svelte', replacement: uncialSrc('runtime/svelte.ts') },
	{ find: 'uncial/web-components', replacement: uncialSrc('web-components/index.ts') },
	{ find: /^uncial$/, replacement: uncialSrc('index.ts') }
];

export default defineConfig({
	plugins: [sveltekit()],
	resolve: { alias: uncialAliases },
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
