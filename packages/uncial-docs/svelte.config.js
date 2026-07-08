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
			'uncial/styles': '../uncial/src/lib/styles/index.css',
			'uncial/core': '../uncial/src/lib/core/index.ts',
			'uncial/render': '../uncial/src/lib/render/index.ts',
			'uncial/editor': '../uncial/src/lib/editor/index.ts',
			'uncial/runtime/svelte': '../uncial/src/lib/runtime/svelte.ts',
			'uncial/web-components': '../uncial/src/lib/web-components/index.ts',
			uncial: '../uncial/src/lib/index.ts',
			'uncial-cms/sveltekit': '../uncial-cms/src/lib/sveltekit/index.ts',
			'uncial-cms/github': '../uncial-cms/src/lib/github/index.ts',
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
		},
		prerender: {
			// In-page TOC anchors target heading ids that the reader page assigns on
			// hydration (uncial's SSR renderer emits headings without ids, and reader
			// pages carry no editor JS to change that at build time). The prerenderer
			// can't see those ids in the static HTML, so don't fail the build on them.
			handleMissingId: 'ignore'
		}
	}
};

export default config;
