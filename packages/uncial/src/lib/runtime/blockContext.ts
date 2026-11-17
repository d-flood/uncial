import { getContext, setContext } from 'svelte';
import { normalizeBlockAttributes } from '../core/attributes.js';
import type { BlockContext, BlockPage, BlockSummary } from '../core/runtime.js';
import type { BlockRegistry } from '../core/types.js';

export const BLOCK_CONTEXT = Symbol('uncial.block');
export const PAGE_CONTEXT = Symbol('uncial.page');

/** The Block context of the Block component calling it, in the Renderer and the editor alike. */
export function getBlock<Attrs = Record<string, unknown>>(): BlockContext<Attrs> {
	const block = getContext<BlockContext<Attrs> | undefined>(BLOCK_CONTEXT);
	if (!block) throw new Error('getBlock() must be called from a Block component');
	return block;
}

export function setBlockContext(block: BlockContext): void {
	setContext(BLOCK_CONTEXT, block);
}

export const emptyPage = (): BlockPage => ({ path: '', template: '', meta: {} });

export function blockAttrs(
	registry: BlockRegistry,
	type: string,
	attrs: Record<string, unknown> | undefined
): Record<string, unknown> {
	const block = registry.get(type);
	if (block) return normalizeBlockAttributes(block, attrs ?? {});
	// Identity attrs differ between a stored document and the editor's schema, so neither side reports them.
	return Object.fromEntries(
		Object.entries(attrs ?? {}).filter(
			([name, value]) => name !== 'id' && name !== 'slug' && value !== null && value !== undefined
		)
	);
}

export function blockSummary(
	registry: BlockRegistry,
	node: { type: string; attrs?: Record<string, unknown> }
): BlockSummary {
	return { type: node.type, attrs: blockAttrs(registry, node.type, node.attrs) };
}
