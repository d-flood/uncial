/**
 * In-page table of contents (ticket 03), derived at render time from a Content
 * document's heading nodes — never stored in the document. `slugify` is exported
 * so the client-side heading-id assignment produces the same anchors the TOC
 * links point at.
 */

export interface TocEntry {
	id: string; // anchor slug, unique within the page
	text: string; // heading's plain text
	level: number; // 1..6
}

interface TocNode {
	type?: string;
	attrs?: { level?: unknown } | null;
	text?: string;
	marks?: unknown[];
	content?: TocNode[] | null;
}

/** Lowercase, hyphenate non-alphanumerics, strip leading/trailing separators. */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-+|-+$/g, '');
}

/** Concatenate the plain text of an inline-node subtree, in order. */
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
	const used = new Map<string, number>();
	for (const node of document?.content ?? []) {
		if (node?.type !== 'heading') continue;
		const text = collectText(node.content).trim();
		if (!text) continue;
		const base = slugify(text) || 'section';
		const count = (used.get(base) ?? 0) + 1;
		used.set(base, count);
		entries.push({ id: count === 1 ? base : `${base}-${count}`, text, level: levelOf(node) });
	}
	return entries;
}
