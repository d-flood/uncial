import adapter from '@sveltejs/adapter-static';

/**
 * The local-only fixture site: the smallest SvelteKit app that declares a site
 * with no GitHub half and reaches its Editor variants through `EditorPage`.
 * Its production build is what proves `assert-clean-pages --local-only`.
 */
/** @type {import('@sveltejs/kit').Config} */
export default {
	kit: {
		outDir: process.env.KIT_OUT_DIR ?? '.svelte-kit',
		// A local-only site's editor variants prerender no entries, so Kit finds a
		// prerenderable route it never crawls. That is the intended shape here.
		prerender: { handleUnseenRoutes: 'ignore' },
		adapter: adapter({
			pages: process.env.BUILD_DIR ?? 'build',
			assets: process.env.BUILD_DIR ?? 'build'
		})
	}
};
