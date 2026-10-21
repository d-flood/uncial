import type { PageRef } from '../index-actions.js';
import type { ContentStatus } from '../server-forge/protocol.js';
import type { PagesQuery } from './routes.js';

export const PAGE_SIZE = 50;

export type ListedPage = PageRef & { title?: string; kind?: string; status?: ContentStatus };

export type PageRow = { pagePath: string; page?: ListedPage; inside?: number };

export function kindOptions(pages: ListedPage[]): string[] {
	return [...new Set(pages.flatMap((page) => page.kind ?? []))].sort();
}

export function isFolder(pages: ListedPage[], folder: string): boolean {
	return pages.some((page) => page.pagePath.startsWith(`${folder}/`));
}

const inFolder = (pagePath: string, folder: string) =>
	pagePath === folder || pagePath.startsWith(`${folder}/`);

export function folderRows(pages: ListedPage[], folder = ''): PageRow[] {
	const prefix = folder ? `${folder}/` : '';
	const children = new Map<string, PageRow>();
	let own: ListedPage | undefined;
	for (const page of pages) {
		if (page.pagePath === folder) own = page;
		else if (page.pagePath.startsWith(prefix)) {
			const [name, ...rest] = page.pagePath.slice(prefix.length).split('/');
			const pagePath = prefix + name;
			const row = children.get(pagePath) ?? { pagePath };
			if (rest.length > 0) row.inside = (row.inside ?? 0) + 1;
			else row.page = page;
			children.set(pagePath, row);
		}
	}
	const rows = [...children.values()].sort((a, b) => a.pagePath.localeCompare(b.pagePath));
	return own ? [{ pagePath: folder, page: own }, ...rows] : rows;
}

/** `draft` and `published` match as the store's `list({ status })` does: a record with both matches both. */
function matchesStatus(page: ListedPage, status: PagesQuery['status']): boolean {
	if (!status) return true;
	return page.status !== (status === 'draft' ? 'published' : 'draft');
}

export function filterPages(pages: ListedPage[], query: PagesQuery): ListedPage[] {
	const needle = query.q?.trim().toLowerCase();
	return pages.filter(
		(page) =>
			(!needle ||
				[page.title, `/${page.pagePath}/`].some((text) => text?.toLowerCase().includes(needle))) &&
			(!query.kind || page.kind === query.kind) &&
			(!query.folder || inFolder(page.pagePath, query.folder)) &&
			matchesStatus(page, query.status)
	);
}

export function pageWindow(
	total: number,
	page = 1
): { page: number; pageCount: number; start: number; end: number } {
	const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const current = Math.min(Math.max(1, page), pageCount);
	const start = (current - 1) * PAGE_SIZE;
	return { page: current, pageCount, start, end: Math.min(start + PAGE_SIZE, total) };
}
