<script lang="ts">
	// Test fixture: a block that renders exactly the image values it is handed.
	interface Props {
		src?: string;
		items?: Array<{ image?: string; caption?: string }>;
		updateAttributes?: (attrs: Record<string, unknown>) => void;
	}

	let { src = '', items = [], updateAttributes }: Props = $props();
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
		onclick={() =>
			updateAttributes?.({ items: items.map((item) => ({ ...item, caption: 'edited' })) })}
	>
		Edit captions
	</button>
</div>
