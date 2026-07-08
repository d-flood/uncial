import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [svelte()],
	resolve: {
		// Resolve svelte (and friends) to their client builds so `mount` works
		// under happy-dom instead of throwing lifecycle_function_unavailable.
		conditions: ['browser'],
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
	test: {
		environment: 'happy-dom',
		include: ['frontend/src/**/*.spec.ts'],
		server: {
			deps: {
				// phosphor-svelte is a transitive dep (via ../uncial sources), so
				// vite-plugin-svelte does not auto-inline it here. Externalized it
				// would import the server build of svelte and throw
				// lifecycle_outside_component at runtime.
				inline: [/phosphor-svelte/]
			}
		}
	}
});
