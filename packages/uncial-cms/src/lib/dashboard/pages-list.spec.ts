import { describe, expect, it } from 'vitest';
import type { ContentStatus } from '../server-forge/protocol.js';
import {
	filterPages,
	folderRows,
	isFolder,
	kindOptions,
	pageWindow,
	type ListedPage
} from './pages-list.js';
import { hashForRoute, routeFromHash, type PagesQuery } from './routes.js';

const STATUSES: ContentStatus[] = ['draft', 'published', 'changed'];

const SERVER_PAGES: ListedPage[] = Array.from({ length: 120 }, (_, n) => {
	const name = `p${String(n).padStart(3, '0')}`;
	const [folder, kind] = n < 60 ? ['posts', 'post'] : n < 100 ? ['docs', 'doc'] : ['', 'page'];
	const pagePath = folder ? `${folder}/${name}` : name;
	return {
		pagePath,
		sourcePath: `/${pagePath}/`,
		title: n % 10 === 0 ? `Annual Report ${n}` : `Entry ${n}`,
		kind,
		status: STATUSES[n % 3]
	};
});
const GIT_PAGES: ListedPage[] = SERVER_PAGES.map(({ pagePath }) => ({
	pagePath,
	sourcePath: `content/${pagePath}.json`
}));

const paths = (pages: ListedPage[]) => pages.map((page) => page.pagePath);

function shown(pages: ListedPage[], query: PagesQuery): ListedPage[] {
	const matches = filterPages(pages, query);
	const { start, end } = pageWindow(matches.length, query.page);
	return matches.slice(start, end);
}

describe('Pages list over 120 entries', () => {
	it('pages by 50, clamping out-of-range pages', () => {
		expect(pageWindow(120)).toEqual({ page: 1, pageCount: 3, start: 0, end: 50 });
		expect(pageWindow(120, 2)).toEqual({ page: 2, pageCount: 3, start: 50, end: 100 });
		expect(pageWindow(120, 3)).toEqual({ page: 3, pageCount: 3, start: 100, end: 120 });
		expect(pageWindow(120, 9).page).toBe(3);
		expect(pageWindow(120, 0).page).toBe(1);
		expect(pageWindow(0)).toEqual({ page: 1, pageCount: 1, start: 0, end: 0 });

		const third = shown(GIT_PAGES, { page: 3 });
		expect(third).toHaveLength(20);
		expect(third[0]!.pagePath).toBe('p100');
		expect(third.at(-1)!.pagePath).toBe('p119');
	});

	it('searches titles and page paths case-insensitively', () => {
		expect(filterPages(SERVER_PAGES, { q: 'ANNUAL report' })).toHaveLength(12);
		expect(paths(filterPages(SERVER_PAGES, { q: 'p11' }))).toEqual(
			Array.from({ length: 10 }, (_, n) => `p11${n}`)
		);
		expect(filterPages(SERVER_PAGES, { q: 'Docs/' })).toHaveLength(40);
		expect(paths(filterPages(SERVER_PAGES, { q: '/posts/p005/' }))).toEqual(['posts/p005']);
		expect(filterPages(GIT_PAGES, { q: 'annual' })).toEqual([]);
		expect(filterPages(GIT_PAGES, { q: '  ' })).toHaveLength(120);
	});

	it('filters by kind and to a folder', () => {
		expect(kindOptions(SERVER_PAGES)).toEqual(['doc', 'page', 'post']);
		expect(kindOptions(GIT_PAGES)).toEqual([]);

		expect(filterPages(SERVER_PAGES, { kind: 'post' })).toHaveLength(60);
		expect(filterPages(GIT_PAGES, { folder: 'docs' })).toHaveLength(40);
		expect(paths(shown(GIT_PAGES, { folder: 'posts', page: 2 }))).toEqual(
			Array.from({ length: 10 }, (_, n) => `posts/p05${n}`)
		);
	});

	it('filters by status as the store does: a Published page with Draft changes is both', () => {
		expect(filterPages(SERVER_PAGES, { status: 'draft' })).toHaveLength(80);
		expect(filterPages(SERVER_PAGES, { status: 'published' })).toHaveLength(80);
		expect(
			paths(filterPages(SERVER_PAGES, { q: 'annual', kind: 'post', status: 'draft' }))
		).toEqual(['posts/p000', 'posts/p020', 'posts/p030', 'posts/p050']);
	});
});

describe('Pages browsed by folder', () => {
	const tree = (...pagePaths: string[]): ListedPage[] =>
		pagePaths.map((pagePath) => ({ pagePath, sourcePath: `/${pagePath}/` }));
	const PAGES = tree('', 'about', 'about/team', '2020/05/01/a', '2020/05/02/b', '2021/01/01/c', 'event/x');
	const rows = (folder?: string) =>
		folderRows(PAGES, folder).map(({ pagePath, page, inside }) => [pagePath, !!page, inside]);

	it('lists the folder’s own page, then its children with the pages inside them', () => {
		expect(rows()).toEqual([
			['', true, undefined],
			['2020', false, 2],
			['2021', false, 1],
			['about', true, 1],
			['event', false, 1]
		]);
		expect(rows('about')).toEqual([
			['about', true, undefined],
			['about/team', true, undefined]
		]);
		expect(rows('2020')).toEqual([['2020/05', false, 2]]);
		expect(rows('2020/05')).toEqual([
			['2020/05/01', false, 1],
			['2020/05/02', false, 1]
		]);
	});

	it('knows a folder only by the pages inside it', () => {
		expect(isFolder(PAGES, 'about')).toBe(true);
		expect(isFolder(PAGES, '2020/05')).toBe(true);
		expect(isFolder(PAGES, 'about/team')).toBe(false);
		expect(isFolder(PAGES, '202')).toBe(false);
	});

	it('scopes a search to the folder and everything beneath it', () => {
		expect(paths(filterPages(PAGES, { folder: 'about' }))).toEqual(['about', 'about/team']);
		expect(paths(filterPages(PAGES, { folder: '2020', q: '/b/' }))).toEqual(['2020/05/02/b']);
		expect(filterPages(PAGES, { folder: '202' })).toEqual([]);
	});
});

describe('Pages query in the hash', () => {
	it('round-trips', () => {
		const hash = '#/pages?q=annual+report&kind=post&status=draft&page=2';
		const route = routeFromHash(hash);
		expect(route).toEqual({
			section: 'pages',
			query: { q: 'annual report', kind: 'post', status: 'draft', page: 2 }
		});
		expect(hashForRoute(route)).toBe(hash);

		const query: PagesQuery = { q: 'a&b=c #d', folder: '2020/05', page: 3 };
		expect(routeFromHash(hashForRoute({ section: 'pages', query }))).toEqual({
			section: 'pages',
			query
		});
	});

	it('drops defaults and invalid values', () => {
		expect(hashForRoute({ section: 'pages', query: { q: '', page: 1 } })).toBe('#/pages');
		expect(routeFromHash('#/pages?status=bogus&page=0&kind=')).toEqual({
			section: 'pages',
			query: {}
		});
		expect(routeFromHash('#/pages?page=2.5')).toEqual({ section: 'pages', query: {} });
	});
});

describe('Dashboard route contracts', () => {
	it.each(['About', 'news/old_page', 'articles/café', 'a b/what?#%'])('round-trips an existing page path %s', (pagePath) => {
		const route = { section: 'edit' as const, pagePath };
		expect(routeFromHash(new URL(hashForRoute(route), 'http://site.test').hash)).toEqual(route);
	});

	it.each(['redirect rules', 'store/orders', 'résumé?#%'])('round-trips an App section id %s', (id) => {
		const route = { section: 'app' as const, id };
		expect(routeFromHash(new URL(hashForRoute(route), 'http://site.test').hash)).toEqual(route);
	});
});
