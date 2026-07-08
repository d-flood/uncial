import { describe, expect, it } from 'vitest';
import { buildDocsNav, DEFAULT_NAV_GROUP, type DocPage } from './nav.js';

const page = (path: string, meta: Partial<DocPage['meta']> = {}): DocPage => ({
	path,
	meta: { title: path, ...meta }
});

describe('buildDocsNav', () => {
	it('groups pages by navGroup, labelling items by title', () => {
		const nav = buildDocsNav([
			page('getting-started', { title: 'Getting started', navGroup: 'Basics', navOrder: 1 }),
			page('blocks', { title: 'Blocks', navGroup: 'Guides', navOrder: 1 })
		]);

		expect(nav).toEqual([
			{ group: 'Basics', items: [{ path: 'getting-started', title: 'Getting started' }] },
			{ group: 'Guides', items: [{ path: 'blocks', title: 'Blocks' }] }
		]);
	});

	it('orders items within a group by navOrder ascending', () => {
		const nav = buildDocsNav([
			page('c', { title: 'C', navGroup: 'G', navOrder: 3 }),
			page('a', { title: 'A', navGroup: 'G', navOrder: 1 }),
			page('b', { title: 'B', navGroup: 'G', navOrder: 2 })
		]);

		expect(nav[0].items.map((i) => i.path)).toEqual(['a', 'b', 'c']);
	});

	it('breaks navOrder ties by title (stable)', () => {
		const nav = buildDocsNav([
			page('z', { title: 'Zebra', navGroup: 'G', navOrder: 1 }),
			page('a', { title: 'Apple', navGroup: 'G', navOrder: 1 })
		]);

		expect(nav[0].items.map((i) => i.title)).toEqual(['Apple', 'Zebra']);
	});

	it('sorts pages with a missing navOrder after ordered ones, then by title', () => {
		const nav = buildDocsNav([
			page('no-order-z', { title: 'Zed', navGroup: 'G' }),
			page('ordered', { title: 'Ordered', navGroup: 'G', navOrder: 5 }),
			page('no-order-a', { title: 'Ada', navGroup: 'G' })
		]);

		expect(nav[0].items.map((i) => i.title)).toEqual(['Ordered', 'Ada', 'Zed']);
	});

	it('puts pages with no navGroup into a stable default bucket', () => {
		const nav = buildDocsNav([page('loose', { title: 'Loose' })]);

		expect(nav).toEqual([
			{ group: DEFAULT_NAV_GROUP, items: [{ path: 'loose', title: 'Loose' }] }
		]);
	});

	it('orders groups by their minimum navOrder, ties broken by group name', () => {
		const nav = buildDocsNav([
			page('later', { title: 'Later', navGroup: 'Advanced', navOrder: 10 }),
			page('early', { title: 'Early', navGroup: 'Intro', navOrder: 1 }),
			page('mid', { title: 'Mid', navGroup: 'Middle', navOrder: 5 })
		]);

		expect(nav.map((g) => g.group)).toEqual(['Intro', 'Middle', 'Advanced']);
	});

	it('orders all-unordered groups by name, after any ordered group', () => {
		const nav = buildDocsNav([
			page('x', { title: 'X', navGroup: 'Zeta' }),
			page('y', { title: 'Y', navGroup: 'Alpha' }),
			page('z', { title: 'Z', navGroup: 'Ordered', navOrder: 2 })
		]);

		expect(nav.map((g) => g.group)).toEqual(['Ordered', 'Alpha', 'Zeta']);
	});

	it('treats a blank/whitespace navGroup as the default bucket', () => {
		const nav = buildDocsNav([page('p', { title: 'P', navGroup: '   ' })]);

		expect(nav[0].group).toBe(DEFAULT_NAV_GROUP);
	});

	it('does not mutate the input array', () => {
		const pages = [
			page('b', { title: 'B', navGroup: 'G', navOrder: 2 }),
			page('a', { title: 'A', navGroup: 'G', navOrder: 1 })
		];
		const snapshot = pages.map((p) => p.path);
		buildDocsNav(pages);
		expect(pages.map((p) => p.path)).toEqual(snapshot);
	});

	it('returns an empty array for no pages', () => {
		expect(buildDocsNav([])).toEqual([]);
	});
});
