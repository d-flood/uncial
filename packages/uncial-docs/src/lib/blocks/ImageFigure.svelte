<script module lang="ts">
	import { defineBlock } from 'uncial';

	export const block = defineBlock({
		id: 'image',
		label: 'Image',
		description: 'A figure with alt text and an optional caption, edited where it appears.',
		attributes: {
			src: { default: '', input: 'image' },
			alt: '',
			caption: ''
		}
	});
</script>

<script lang="ts">
	import { getBlock, Image, Text, type BlockProps } from 'uncial';

	let { caption }: BlockProps<typeof block> = $props();

	const { editing } = getBlock();
</script>

<figure class="uncial-image my-4">
	<Image name="src" class="max-w-full rounded-box border border-base-content/15" />
	{#if caption || editing}
		<figcaption class="mt-2 text-sm opacity-70"><Text name="caption" /></figcaption>
	{/if}
</figure>
