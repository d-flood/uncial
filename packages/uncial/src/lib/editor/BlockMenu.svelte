<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import type { BlockDefinition, BlockRegistry, ContentSchema } from '../core/types.js';
	import { resolveRegistry } from '../core/registry.js';
	import { getBlockDefaultAttrs } from '../shared/tiptap.js';

	interface Props {
		editor?: Editor | null;
		blocks?: BlockRegistry | BlockDefinition[];
		schema?: ContentSchema;
	}

	let { editor = null, blocks = [], schema = undefined }: Props = $props();

	let query = $state('');

	const registry = $derived(resolveRegistry(blocks));
	const availableBlocks = $derived(
		registry.blocks
			.filter((block: BlockDefinition) => !schema || schema.allowedBlocks.has(block.id))
			.filter((block: BlockDefinition) => block.label.toLowerCase().includes(query.toLowerCase()))
	);

	function insertBlock(id: string): void {
		if (!editor) return;
		const block = registry.get(id);
		if (!block) return;

		editor
			.chain()
			.focus()
			.insertContent({
				type: block.id,
				attrs: getBlockDefaultAttrs(block)
			})
			.run();
	}
</script>

<div class="uncial-block-menu uncial-toolbar">
	<input
		class="uncial-input uncial-input--sm"
		type="search"
		placeholder="Filter blocks..."
		bind:value={query}
	/>
	{#each availableBlocks as block (block.id)}
		<button type="button" class="uncial-btn uncial-btn--sm" onclick={() => insertBlock(block.id)}>
			{block.label}
		</button>
	{/each}
</div>
