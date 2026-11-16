/**
 * `uncial-cms/nav` — grouped, ordered site navigation from Content documents'
 * `navGroup`, `navOrder` and `navLabel` meta. Pure: safe in any bundle.
 */

export interface NavLink {
	href: string;
	label: string;
}

export type NavEntry =
	({ kind: 'link' } & NavLink) | { kind: 'group'; id: string; label: string; links: NavLink[] };

/** A page as the route helpers' `list()` returns it. */
export interface NavPage {
	path: string;
	document: { meta?: Record<string, unknown> };
}

/** A link that is not a Content document, placed like one. */
export interface NavExtraLink extends NavLink {
	/** Blank or absent for a top-level link. */
	group?: string;
	order?: number;
}

export interface BuildNavOptions {
	/** Prepended to every site-root-relative href, e.g. SvelteKit's `base`. */
	base?: string;
	links?: NavExtraLink[];
}

interface Placed extends NavLink {
	group: string;
	order: number;
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const finite = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? value : Infinity;

/**
 * Links sort by `navOrder` (absent last), then label. A group sits where its
 * first member sorts and is labelled by its `navGroup`.
 */
export function buildNav(pages: NavPage[], options: BuildNavOptions = {}): NavEntry[] {
	const base = (options.base ?? '').replace(/\/+$/, '');
	const withBase = (href: string) => (href.startsWith('/') ? base + href : href);
	const placed: Placed[] = [
		...(options.links ?? []).map((link) => ({
			href: withBase(link.href),
			label: link.label,
			group: text(link.group),
			order: finite(link.order)
		})),
		...pages.map(({ path, document }) => {
			const meta = document.meta ?? {};
			return {
				href: withBase(path === '' ? '/' : `/${path}/`),
				label: text(meta.navLabel) || text(meta.title) || path,
				group: text(meta.navGroup),
				order: finite(meta.navOrder)
			};
		})
	];
	placed.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));

	const entries: NavEntry[] = [];
	const groups = new Map<string, NavLink[]>();
	for (const { href, label, group } of placed) {
		if (group === '') {
			entries.push({ kind: 'link', href, label });
			continue;
		}
		let links = groups.get(group);
		if (!links) {
			links = [];
			groups.set(group, links);
			const id = group
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '');
			entries.push({ kind: 'group', id, label: group, links });
		}
		links.push({ href, label });
	}
	return entries;
}
