import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [svelte()],
	resolve: {
		alias: [
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
	test: {
		environment: 'happy-dom',
		include: ['frontend/src/**/*.spec.ts']
	}
});
