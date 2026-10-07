import { GLOBAL_NAME, isGlobalsPath } from '../globals.js';

export type DashboardSection = 'pages' | 'media' | 'globals';

export interface PagesQuery {
	q?: string;
	kind?: string;
	folder?: string;
	status?: 'draft' | 'published';
	page?: number;
}

export type DashboardRoute =
	| { section: 'pages'; query?: PagesQuery }
	| { section: 'edit'; pagePath: string }
	| { section: 'media' }
	| { section: 'globals'; name?: string }
	| { section: 'app'; id: string };

const PAGES: DashboardRoute = { section: 'pages' };

function editRoute(path: string): DashboardRoute {
	try {
		const pagePath = decodeURIComponent(path);
		if (isGlobalsPath(pagePath) || pagePath.split('/').some((part) => part === '.' || part === '..')) {
			return PAGES;
		}
		return { section: 'edit', pagePath };
	} catch {
		return PAGES;
	}
}

function pagesRoute(search: string): DashboardRoute {
	const params = new URLSearchParams(search);
	const query: PagesQuery = {};
	for (const key of ['q', 'kind', 'folder'] as const) {
		const value = params.get(key);
		if (value) query[key] = value;
	}
	const status = params.get('status');
	if (status === 'draft' || status === 'published') query.status = status;
	const page = Number(params.get('page'));
	if (Number.isInteger(page) && page > 1) query.page = page;
	return { section: 'pages', query };
}

export function routeFromHash(hash: string): DashboardRoute {
	if (!hash.startsWith('#/')) return PAGES;
	const rest = hash.slice(2);
	if (rest === 'pages' || rest.startsWith('pages?')) return pagesRoute(rest.slice('pages'.length));
	if (rest === 'media') return { section: 'media' };
	if (rest === 'globals') return { section: 'globals' };
	if (rest.startsWith('edit/')) return editRoute(rest.slice('edit/'.length).replace(/\/+$/, ''));
	const [head, name, ...more] = rest.split('/');
	if (head === 'globals' && name && more.length === 0 && GLOBAL_NAME.test(name)) {
		return { section: 'globals', name };
	}
	if (head === 'app' && name && more.length === 0) {
		try {
			return { section: 'app', id: decodeURIComponent(name) };
		} catch {
			return PAGES;
		}
	}
	if (rest === '' || rest.endsWith('/')) return editRoute(rest.replace(/\/+$/, ''));
	return PAGES;
}

export function hashForRoute(route: DashboardRoute): string {
	switch (route.section) {
		case 'edit':
			return `#/edit/${route.pagePath.split('/').map(encodeURIComponent).join('/')}`;
		case 'globals':
			return route.name ? `#/globals/${route.name}` : '#/globals';
		case 'app':
			return `#/app/${encodeURIComponent(route.id)}`;
		case 'pages': {
			const { page, ...filters } = route.query ?? {};
			const search = new URLSearchParams();
			for (const [key, value] of Object.entries(filters)) if (value) search.set(key, value);
			if (page && page > 1) search.set('page', String(page));
			const query = search.toString();
			return query ? `#/pages?${query}` : '#/pages';
		}
		default:
			return `#/${route.section}`;
	}
}
