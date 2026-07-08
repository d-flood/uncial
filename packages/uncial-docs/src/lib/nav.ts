/**
 * Content-driven docs navigation (ticket 03). Pure and node-testable: turns the
 * Index listing (each page's site path plus its editable meta) into a grouped,
 * ordered sidebar model. Structure is data, not code — a maintainer sets
 * `navGroup`/`navOrder` in the CMS metadata panel and the sidebar reorders with
 * no code change.
 */

/** Editable meta fields declared in the uncial-docs schema (see routes/site.ts). */
export interface DocMeta {
	title: string;
	navGroup?: string;
	navOrder?: number;
}

export interface DocPage {
	/** Site-relative page path, no surrounding slashes ('' = site root). */
	path: string;
	meta: DocMeta;
}

export interface NavItem {
	path: string;
	title: string;
}

export interface NavGroup {
	group: string;
	items: NavItem[];
}

/** Pages with no (or a blank) navGroup fall into this stable bucket. */
export const DEFAULT_NAV_GROUP = 'Docs';

/** Missing/non-finite navOrder sorts after every explicitly ordered page. */
function orderOf(meta: DocMeta): number {
	return typeof meta.navOrder === 'number' && Number.isFinite(meta.navOrder)
		? meta.navOrder
		: Number.POSITIVE_INFINITY;
}

function groupOf(meta: DocMeta): string {
	const group = meta.navGroup?.trim();
	return group ? group : DEFAULT_NAV_GROUP;
}

/** navOrder asc; ties broken by title, then path — a total, stable order. */
function compareWithinGroup(a: DocPage, b: DocPage): number {
	const oa = orderOf(a.meta);
	const ob = orderOf(b.meta);
	if (oa !== ob) return oa < ob ? -1 : 1;
	const byTitle = a.meta.title.localeCompare(b.meta.title);
	if (byTitle !== 0) return byTitle;
	return a.path.localeCompare(b.path);
}

export function buildDocsNav(pages: DocPage[]): NavGroup[] {
	const buckets = new Map<string, DocPage[]>();
	for (const page of pages) {
		const key = groupOf(page.meta);
		const bucket = buckets.get(key);
		if (bucket) bucket.push(page);
		else buckets.set(key, [page]);
	}

	const built = Array.from(buckets, ([group, groupPages]) => {
		const sorted = [...groupPages].sort(compareWithinGroup);
		const minOrder = sorted.reduce(
			(min, page) => Math.min(min, orderOf(page.meta)),
			Number.POSITIVE_INFINITY
		);
		return {
			group,
			minOrder,
			items: sorted.map((page) => ({ path: page.path, title: page.meta.title }))
		};
	});

	built.sort((a, b) => {
		if (a.minOrder !== b.minOrder) return a.minOrder < b.minOrder ? -1 : 1;
		return a.group.localeCompare(b.group);
	});

	return built.map(({ group, items }) => ({ group, items }));
}
