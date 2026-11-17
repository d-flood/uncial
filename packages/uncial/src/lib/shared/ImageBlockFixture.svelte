<script lang="ts">
	// Test fixture: a block that renders exactly the image values it is handed.
	import { getBlock } from '../runtime/blockContext.js';

	interface Props {
		src?: string;
		items?: Array<{ image?: string; caption?: string }>;
	}

	let { src = '', items = [] }: Props = $props();

	const block = getBlock();
</script>

<div data-testid="image-block-fixture">
	{#if src}
		<img data-testid="canvas-image" {src} alt="" />
	{/if}
	{#each items as item, index (index)}
		{#if item.image}
			<img data-testid="canvas-gallery-image" src={item.image} alt="" />
		{/if}
	{/each}
	<button
		type="button"
		data-testid="edit-captions"
		onclick={() => block.update({ items: items.map((item) => ({ ...item, caption: 'edited' })) })}
	>
		Edit captions
	</button>
</div>
