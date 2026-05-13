import type { PMDoc, PMMark, PMNode } from '../shared/document.js';
import type { BlockDefinition, ContentSchema } from './types.js';
import { resolveRegistry } from './registry.js';
import { normalizeBlockAttributes } from './attributes.js';
import { normalizeMeta } from './meta.js';

export const CURRENT_DOCUMENT_VERSION = 1;

function normalizeMarks(marks: PMMark[] | undefined, schema?: ContentSchema): PMMark[] | undefined {
	if (!marks) return undefined;

	const normalized = marks.filter(
		(mark): mark is PMMark => Boolean(mark?.type) && (!schema || schema.allowedMarks.has(mark.type))
	);

	return normalized.length ? normalized : undefined;
}

function normalizeNode(
	node: PMNode,
	registryBlocks: Map<string, BlockDefinition>,
	schema?: ContentSchema
): PMNode {
	const block = registryBlocks.get(node.type);
	const normalizedContent = Array.isArray(node.content)
		? node.content.map((child) => normalizeNode(child, registryBlocks, schema))
		: undefined;

	if (block) {
		return {
			type: node.type,
			attrs: normalizeBlockAttributes(block, node.attrs ?? {}),
			marks: normalizeMarks(node.marks, schema),
			content: block.content ? normalizedContent : undefined
		};
	}

	return {
		...node,
		marks: normalizeMarks(node.marks, schema),
		content: normalizedContent
	};
}

export function normalizeDocument(
	document: Partial<PMDoc> | null | undefined,
	blocks: Parameters<typeof resolveRegistry>[0],
	schema?: ContentSchema
): PMDoc {
	const registry = resolveRegistry(blocks);
	const registryBlocks = new Map<string, BlockDefinition>(
		registry.blocks.map((block) => [block.id, block] as const)
	);
	const content = Array.isArray(document?.content) ? document.content : [];

	const metaFields = schema?.metaFields ?? new Map();
	const normalized: PMDoc = {
		type: 'doc',
		version: CURRENT_DOCUMENT_VERSION,
		content: content.map((node) => normalizeNode(node, registryBlocks, schema))
	};

	if (metaFields.size > 0) {
		normalized.meta = normalizeMeta(document?.meta, metaFields);
	}

	return normalized;
}
