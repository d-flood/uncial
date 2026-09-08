import adapter from '@sveltejs/adapter-static';

/**
 * The packed-tarball fixture: a bare SvelteKit site that resolves `uncial` and
 * `uncial-cms` the way an installer does. It declares no aliases on purpose —
 * an `exports` or `files` mistake in either package must surface here.
 */
/** @type {import('@sveltejs/kit').Config} */
export default {
	kit: {
		adapter: adapter({ pages: 'build', assets: 'build' })
	}
};
