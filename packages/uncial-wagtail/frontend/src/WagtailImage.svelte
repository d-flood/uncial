<script lang="ts">
	import type { UncialReferenceMap, WagtailImageReference } from './references.js';
	import { imageReferenceKey } from './references.js';

	interface Props {
		imageId?: number | null;
		rendition?: string;
		alt?: string;
		position?: 'left' | 'right' | 'full-width';
		decorative?: boolean;
		references?: UncialReferenceMap;
		class?: string;
		loading?: 'lazy' | 'eager';
	}

	let {
		imageId,
		rendition = 'width-1200',
		alt = '',
		position = 'full-width',
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
	<figure class={[className, 'uncial-wagtail-image', `uncial-wagtail-image--${position}`]}>
		<img
			src={resolved.url}
			width={resolved.width}
			height={resolved.height}
			alt={resolvedAlt}
			{loading}
			decoding="async"
		/>
	</figure>
{/if}

<style>
	.uncial-wagtail-image {
		margin: 1rem 0;
	}

	.uncial-wagtail-image img {
		display: block;
		max-width: 100%;
		height: auto;
		border-radius: var(--uncial-radius-lg, 0.5rem);
	}

	.uncial-wagtail-image--left,
	.uncial-wagtail-image--right {
		width: min(42%, 22rem);
		max-width: min(42%, 22rem);
	}

	.uncial-wagtail-image--left img,
	.uncial-wagtail-image--right img {
		width: 100%;
	}

	.uncial-wagtail-image--left {
		float: left;
		margin-right: 1.25rem;
	}

	.uncial-wagtail-image--right {
		float: right;
		margin-left: 1.25rem;
	}

	.uncial-wagtail-image--full-width {
		clear: both;
		width: 100%;
	}

	.uncial-wagtail-image--full-width img {
		width: 100%;
	}

	@media (max-width: 40rem) {
		.uncial-wagtail-image--left,
		.uncial-wagtail-image--right {
			float: none;
			width: 100%;
			max-width: none;
			margin-inline: 0;
		}
	}
</style>
