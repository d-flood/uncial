<script lang="ts">
	// Test fixture: a block that renders exactly the image values it is handed.
	interface Props {
		src?: string;
		items?: Array<{ image?: string }>;
	}

	let { src = '', items = [] }: Props = $props();
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
</div>
