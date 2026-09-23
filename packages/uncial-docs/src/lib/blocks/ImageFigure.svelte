<script lang="ts">
	// Docs Image: an atomic figure with alt text and an optional caption. `src`
	// is an `input: 'image'` attribute, so the editor's attributes panel owns
	// upload and the canvas hands this component a `blob:` preview until deploy.
	import { base } from '$app/paths';
	import { resolveImageSrc } from 'uncial/render';

	interface Props {
		src?: string;
		alt?: string;
		caption?: string;
	}

	let { src = '', alt = '', caption = '' }: Props = $props();
</script>

<figure class="uncial-image my-4">
	{#if src}
		<img
			src={resolveImageSrc(src, base)}
			{alt}
			class="max-w-full rounded-box border border-base-content/15"
		/>
	{/if}
	{#if caption}
		<figcaption class="mt-2 text-sm opacity-70">{caption}</figcaption>
	{/if}
</figure>
