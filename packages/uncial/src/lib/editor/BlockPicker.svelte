<script lang="ts">
	import type { BlockDefinition } from '../core/types.js';

	interface Props {
		blocks: BlockDefinition[];
		onChoose: (blockId: string) => void;
	}

	let { blocks, onChoose }: Props = $props();

	let query = $state('');
	const menuId = $props.id();

	const groups = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		const grouped: [string, BlockDefinition[]][] = [];
		for (const block of blocks) {
			const text = [block.label, block.description, block.group].join(' ').toLowerCase();
			if (needle && !text.includes(needle)) continue;
			const group = block.group ?? '';
			const found = grouped.find(([name]) => name === group);
			if (found) found[1].push(block);
			else grouped.push([group, [block]]);
		}
		return grouped;
	});

	function choose(blockId: string): void {
		query = '';
		onChoose(blockId);
	}
</script>

<input
	class="uncial-input uncial-input--xs uncial-input--block uncial-dropdown__search"
	type="search"
	placeholder="Filter blocks..."
	aria-label="Filter blocks"
	bind:value={query}
/>
<div class="uncial-block-picker">
	{#each groups as [group, members] (group)}
		<div class="uncial-block-picker__group">
			{#if group}<p class="uncial-section-label uncial-block-picker__group-label">{group}</p>{/if}
			<ul class="uncial-menu">
				{#each members as block (block.id)}
					<li>
						<button
							type="button"
							aria-label={block.label}
							aria-describedby={block.description ? `${menuId}-${block.id}` : undefined}
							onclick={() => choose(block.id)}
						>
							{block.label}
							{#if block.description}
								<span id="{menuId}-{block.id}" class="uncial-menu__description"
									>{block.description}</span
								>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{:else}
		<p class="uncial-menu__empty">No matching blocks</p>
	{/each}
</div>
