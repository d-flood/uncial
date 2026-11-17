import { base } from '$app/paths';
import { buildNav } from 'uncial-cms';
import { contentRoutes } from 'uncial-cms/sveltekit';
import { buildDocsToc } from '$lib/toc.js';
import { site } from '../site.js';

const { list } = contentRoutes(site);

export const load = ({ params }) => {
	const path = params.path.replace(/^\/+|\/+$/g, '');
	return {
		nav: buildNav(list(), { base }),
		toc: buildDocsToc(list().find((page) => page.path === path)?.document)
	};
};
