import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// KIT_OUT_DIR isolates the e2e builds' generated files so the plain and
		// base-path builds can run concurrently (see playwright.config.ts).
		outDir: process.env.KIT_OUT_DIR ?? '.svelte-kit',
		// Resolve uncial's exports from workspace source for the demo app and
		// svelte-check: the published exports point at packages/uncial/dist,
		// which does not exist on a fresh checkout (CI). Mirrors the vite-level
		// aliases in vite.config.ts (which non-kit tooling needs).
		alias: {
			'uncial/styles': '../uncial/src/lib/styles/index.css',
			'uncial/core': '../uncial/src/lib/core/index.ts',
			'uncial/render': '../uncial/src/lib/render/index.ts',
			'uncial/editor': '../uncial/src/lib/editor/index.ts',
			'uncial/runtime/svelte': '../uncial/src/lib/runtime/svelte.ts',
			'uncial/web-components': '../uncial/src/lib/web-components/index.ts',
			uncial: '../uncial/src/lib/index.ts'
		},
		// Fully prerendered demo site; no fallback — every route is static.
		adapter: adapter({
			// BUILD_DIR lets the e2e setup produce the plain and base-path builds
			// side by side without clobbering each other.
			pages: process.env.BUILD_DIR ?? 'build',
			assets: process.env.BUILD_DIR ?? 'build'
		}),
		paths: {
			base: process.argv.includes('dev') ? '' : (process.env.BASE_PATH ?? '')
		}
	}
};

export default config;
