import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Builds the demo-only block registration bundle (callout/card) into the demo
// project's static files. These blocks are deliberately NOT part of the
// shipped admin bundle; consumers register their own blocks the same way.
export default defineConfig({
	plugins: [svelte()],
	resolve: {
		alias: [
			{
				find: 'uncial/styles',
				replacement: new URL('../uncial/src/lib/styles/index.css', import.meta.url).pathname
			},
			{
				find: 'uncial/editor',
				replacement: new URL('../uncial/src/lib/editor/index.ts', import.meta.url).pathname
			},
			{
				find: 'uncial/runtime/svelte',
				replacement: new URL('../uncial/src/lib/runtime/svelte.ts', import.meta.url).pathname
			},
			{
				find: 'uncial/core',
				replacement: new URL('../uncial/src/lib/core/index.ts', import.meta.url).pathname
			},
			{ find: /^uncial$/, replacement: new URL('../uncial/src/lib/index.ts', import.meta.url).pathname }
		]
	},
	build: {
		emptyOutDir: false,
		lib: {
			entry: 'frontend/src/demoBlocks-entry.ts',
			formats: ['iife'],
			name: 'UncialWagtailDemoBlocks',
			fileName: () => 'demo-blocks.js'
		},
		outDir: 'demo/pages/static/pages',
		rollupOptions: {
			output: {
				assetFileNames: 'demo-blocks.[ext]'
			}
		}
	}
});
