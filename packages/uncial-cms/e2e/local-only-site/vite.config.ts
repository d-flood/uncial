import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { uncialAliases } from '../../vite.config.ts';
import { uncialCms } from '../../src/lib/vite/index.ts';

// UNCIAL_FIXTURE_GITHUB=1 gives the fixture a GitHub half, which is what makes
// the same site fail `--local-only` and pass the default mode. The site module
// reads the flag through the define below, because it also runs in the browser.
const github =
	process.env.UNCIAL_FIXTURE_GITHUB === '1'
		? { repo: 'uncial-fixture/site', branch: 'main' }
		: undefined;

export default defineConfig({
	plugins: [uncialCms({ contentDir: 'content', github }), sveltekit()],
	define: {
		'import.meta.env.UNCIAL_FIXTURE_GITHUB': JSON.stringify(github !== undefined)
	},
	resolve: {
		alias: [
			...uncialAliases,
			{ find: 'uncial-cms/sveltekit', replacement: new URL('../../src/lib/sveltekit/index.ts', import.meta.url).pathname },
			{ find: 'uncial-cms/svelte', replacement: new URL('../../src/lib/svelte/index.ts', import.meta.url).pathname },
			{ find: /^uncial-cms$/, replacement: new URL('../../src/lib/index.ts', import.meta.url).pathname }
		]
	}
});
