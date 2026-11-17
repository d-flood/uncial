/**
 * In-page table of contents from a Content document's top-level headings. Each
 * entry's id is the heading's persisted slug, which the Renderer emits as the
 * heading's `id`.
 */

export interface TocEntry {
	id: string;
	text: string;
	level: number;
}

interface TocNode {
	type?: string;
	attrs?: { level?: unknown; slug?: unknown } | null;
	text?: string;
	content?: TocNode[] | null;
}

function collectText(nodes: TocNode[] | null | undefined): string {
	if (!nodes) return '';
	let text = '';
	for (const node of nodes) {
		if (typeof node.text === 'string') text += node.text;
		else text += collectText(node.content);
	}
	return text;
}

function levelOf(node: TocNode): number {
	const raw = Number(node.attrs?.level ?? 1);
	if (!Number.isFinite(raw)) return 1;
	return Math.min(6, Math.max(1, Math.trunc(raw)));
}

export function buildDocsToc(
	document: { content?: TocNode[] | null } | null | undefined
): TocEntry[] {
	const entries: TocEntry[] = [];
	for (const node of document?.content ?? []) {
		const slug = node?.type === 'heading' ? node.attrs?.slug : undefined;
		if (typeof slug !== 'string' || slug === '') continue;
		const text = collectText(node.content).trim();
		if (text) entries.push({ id: slug, text, level: levelOf(node) });
	}
	return entries;
}
