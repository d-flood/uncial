import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// KIT_OUT_DIR isolates the e2e build's generated files so it can run
		// alongside other builds (mirrors uncial-cms).
		outDir: process.env.KIT_OUT_DIR ?? '.svelte-kit',
		// Resolve uncial's AND uncial-cms's exports from workspace source: the
		// published exports point at each package's dist/, which does not exist on
		// a fresh checkout (CI). Mirrored in vite.config.ts (non-kit tooling needs
		// them). Kit expands these as exact tsconfig `paths` keys.
		alias: {
			// The './styles/*' subpath exports need their own entries ahead of the
			// bare one: a kit alias key without a wildcard also matches its subpaths,
			// and a wildcard key cannot supply the .css extension.
			'uncial/styles/chrome.css': '../uncial/src/lib/styles/chrome.css',
			'uncial/styles/chrome': '../uncial/src/lib/styles/chrome.css',
			'uncial/styles': '../uncial/src/lib/styles/index.css',
			'uncial/editor': '../uncial/src/lib/editor/index.ts',
			'uncial/web-components': '../uncial/src/lib/web-components/index.ts',
			'uncial/internal': '../uncial/src/lib/internal.ts',
			uncial: '../uncial/src/lib/index.ts',
			'uncial-cms/sveltekit': '../uncial-cms/src/lib/sveltekit/index.ts',
			'uncial-cms/svelte': '../uncial-cms/src/lib/svelte/index.ts',
			'uncial-cms/vite': '../uncial-cms/src/lib/vite/index.ts',
			'uncial-cms': '../uncial-cms/src/lib/index.ts'
		},
		// Fully prerendered docs site; no fallback — every route is static.
		adapter: adapter({
			// BUILD_DIR lets the e2e setup produce a build without clobbering the
			// default output.
			pages: process.env.BUILD_DIR ?? 'build',
			assets: process.env.BUILD_DIR ?? 'build'
		}),
		paths: {
			base: process.argv.includes('dev') ? '' : (process.env.BASE_PATH ?? '')
		}
	}
};

export default config;
