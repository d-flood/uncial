<script lang="ts">
	import type { UncialReferenceMap, WagtailImageReference } from './references.js';
	import { imageReferenceKey } from './references.js';

	interface Props {
		imageId?: number | null;
		rendition?: string;
		alt?: string;
		decorative?: boolean;
		references?: UncialReferenceMap;
		class?: string;
		loading?: 'lazy' | 'eager';
	}

	let {
		imageId,
		rendition = 'width-1200',
		alt = '',
		decorative = false,
		references = {},
		class: className = '',
		loading = 'lazy'
	}: Props = $props();

	let resolved = $derived(
		imageId ? (references[imageReferenceKey(imageId, rendition)] as WagtailImageReference | undefined) : undefined
	);
	let resolvedAlt = $derived(decorative ? '' : alt || resolved?.alt || resolved?.title || '');
</script>

{#if resolved}
	<img
		class={className}
		src={resolved.url}
		width={resolved.width}
		height={resolved.height}
		alt={resolvedAlt}
		{loading}
		decoding="async"
	/>
{/if}
