import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Builds/serves the plain HTML e2e fixture page. The fixture itself is
// framework-free; the svelte plugin only compiles uncial's editor components
// pulled in through `uncial/web-components`.
export default defineConfig({
	root: 'e2e/fixture',
	build: {
		outDir: '../../.fixture-dist',
		emptyOutDir: true
	},
	plugins: [svelte()]
});
