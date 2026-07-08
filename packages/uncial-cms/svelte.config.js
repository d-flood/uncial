import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// KIT_OUT_DIR isolates the e2e builds' generated files so the plain and
		// base-path builds can run concurrently (see playwright.config.ts).
		outDir: process.env.KIT_OUT_DIR ?? '.svelte-kit',
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
