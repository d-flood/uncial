import type { PMDoc, PMNode } from './document.js';

let fallbackIdSequence = 0;

export function createBlockId(): string {
	if (typeof globalThis.crypto?.randomUUID === 'function') {
		return globalThis.crypto.randomUUID();
	}

	fallbackIdSequence += 1;
	return `uncial-${Date.now().toString(36)}-${fallbackIdSequence.toString(36)}`;
}

export function isBlockNode(node: Pick<PMNode, 'type'>): boolean {
	return node.type !== 'text' && node.type !== 'hardBreak';
}

function nodeText(node: PMNode): string {
	if (node.type === 'text') return node.text ?? '';
	return node.content?.map(nodeText).join('') ?? '';
}

export function headingSlug(node: PMNode): string {
	const slug = nodeText(node)
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return slug || 'section';
}

export function stampNodeIdentity(
	node: PMNode,
	attrs: Record<string, unknown> | undefined,
	ids: Set<string>
): Record<string, unknown> | undefined {
	if (!isBlockNode(node)) return attrs;

	const persistedId = attrs?.id;
	const id =
		typeof persistedId === 'string' && persistedId.length > 0 && !ids.has(persistedId)
			? persistedId
			: createBlockId();
	ids.add(id);

	const stamped: Record<string, unknown> = { ...attrs, id };
	if (node.type === 'heading' && typeof attrs?.slug !== 'string') {
		stamped.slug = headingSlug(node);
	}

	return stamped;
}

function stampNode(node: PMNode, ids: Set<string>): PMNode {
	const content = node.content?.map((child) => stampNode(child, ids));
	const stamped: PMNode = { ...node };
	if (content === undefined) {
		delete stamped.content;
	} else {
		stamped.content = content;
	}
	const attrs = stampNodeIdentity(stamped, node.attrs, ids);

	if (attrs === undefined) {
		delete stamped.attrs;
	} else {
		stamped.attrs = attrs;
	}
	return stamped;
}

export function stampDocumentIdentity(document: PMDoc): PMDoc {
	const ids = new Set<string>();

	return {
		...document,
		content: document.content?.map((node) => stampNode(node, ids))
	};
}
