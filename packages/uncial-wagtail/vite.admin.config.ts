import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

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
			entry: 'frontend/src/admin.ts',
			formats: ['iife'],
			name: 'UncialWagtailAdmin',
			fileName: () => 'editor-bundle.js'
		},
		outDir: 'src/uncial_wagtail/static/uncial_wagtail',
		rollupOptions: {
			output: {
				assetFileNames: 'editor-bundle.[ext]'
			}
		}
	}
});
