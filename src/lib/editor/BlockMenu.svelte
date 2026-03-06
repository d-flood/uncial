<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import type { BlockDefinition, BlockRegistry, ContentSchema } from '../core/types.js';
	import { resolveRegistry } from '../core/registry.js';
	import { getBlockDefaultAttrs } from '../shared/tiptap.js';
	import '../styles/uncial.css';

	export let editor: Editor | null = null;
	export let blocks: BlockRegistry | BlockDefinition[] = [];
	export let schema: ContentSchema | undefined = undefined;

	let query = '';

	$: registry = resolveRegistry(blocks);
	$: availableBlocks = registry.blocks
		.filter((block: BlockDefinition) => !schema || schema.allowedBlocks.has(block.id))
		.filter((block: BlockDefinition) => block.label.toLowerCase().includes(query.toLowerCase()));

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

<div class="uncial-toolbar">
	<input type="search" placeholder="Filter blocks..." bind:value={query} />
	{#each availableBlocks as block (block.id)}
		<button type="button" on:click={() => insertBlock(block.id)}>{block.label}</button>
	{/each}
</div>
