import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// Resolve uncial's + uncial-cms's subpath exports from workspace source (same
// pattern as uncial-cms's own config): the published exports point at each
// package's dist/, which does not exist on a fresh checkout (CI builds the docs
// site, not the libs). Mirrors the kit-level aliases in svelte.config.js.
const uncialSrc = (path: string) => new URL(`../uncial/src/lib/${path}`, import.meta.url).pathname;
const cmsSrc = (path: string) =>
	new URL(`../uncial-cms/src/lib/${path}`, import.meta.url).pathname;

export const workspaceAliases = [
	{ find: 'uncial/styles', replacement: uncialSrc('styles/index.css') },
	{ find: 'uncial/core', replacement: uncialSrc('core/index.ts') },
	{ find: 'uncial/render', replacement: uncialSrc('render/index.ts') },
	{ find: 'uncial/editor', replacement: uncialSrc('editor/index.ts') },
	{ find: 'uncial/runtime/svelte', replacement: uncialSrc('runtime/svelte.ts') },
	{ find: 'uncial/web-components', replacement: uncialSrc('web-components/index.ts') },
	{ find: /^uncial$/, replacement: uncialSrc('index.ts') },
	{ find: 'uncial-cms/sveltekit', replacement: cmsSrc('sveltekit/index.ts') },
	{ find: 'uncial-cms/github', replacement: cmsSrc('github/index.ts') },
	{ find: /^uncial-cms$/, replacement: cmsSrc('index.ts') }
];

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	resolve: { alias: workspaceAliases },
	test: {
		expect: { requireAssertions: true },
		passWithNoTests: true,
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
