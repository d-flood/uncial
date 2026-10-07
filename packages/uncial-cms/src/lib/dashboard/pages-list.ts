import type { PageRef } from '../index-actions.js';
import type { ContentStatus } from '../server-forge/protocol.js';
import type { PagesQuery } from './routes.js';

export const PAGE_SIZE = 50;

export type ListedPage = PageRef & { title?: string; kind?: string; status?: ContentStatus };

const firstSegment = (pagePath: string) => pagePath.split('/')[0];
const sorted = (values: Iterable<string>) => [...new Set(values)].sort();

export function kindOptions(pages: ListedPage[]): string[] {
	return sorted(pages.flatMap((page) => page.kind ?? []));
}

export function folderOptions(pages: ListedPage[]): string[] {
	return sorted(
		pages.filter((page) => page.pagePath.includes('/')).map((page) => firstSegment(page.pagePath))
	);
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
			(!query.folder || firstSegment(page.pagePath) === query.folder) &&
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
