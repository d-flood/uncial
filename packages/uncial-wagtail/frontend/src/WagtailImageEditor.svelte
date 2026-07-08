<script lang="ts">
	import { imagePreviewUrl } from './apiUrls.js';

	interface Props {
		imageId?: number | null;
		alt?: string;
		rendition?: string;
		position?: 'left' | 'right' | 'full-width';
		decorative?: boolean;
		previewUrl?: string;
	}

	let {
		imageId = null,
		alt = '',
		rendition = 'width-1200',
		position = 'full-width',
		decorative = false,
		previewUrl = ''
	}: Props = $props();

	let editorPreviewUrl = $derived(previewUrl || (imageId ? imagePreviewUrl(imageId) : ''));
</script>

<div
	class={['uncial-wagtail-image-editor', `uncial-wagtail-image-editor--${position}`]}
	aria-label="Wagtail image block"
>
	{#if editorPreviewUrl}
		<img class="preview" src={editorPreviewUrl} alt={decorative ? '' : alt} />
	{:else if imageId}
		<p>Selected Wagtail image #{imageId}</p>
	{:else}
		<div class="placeholder">No image selected</div>
	{/if}
</div>

<style>
	.uncial-wagtail-image-editor {
		display: grid;
		gap: 0.75rem;
		width: 100%;
	}

	:global(.uncial-nodeview:has(.uncial-wagtail-image-editor--left)),
	:global(.uncial-nodeview:has(.uncial-wagtail-image-editor--right)) {
		width: min(42%, 22rem);
		max-width: min(42%, 22rem);
	}

	:global(.uncial-nodeview:has(.uncial-wagtail-image-editor--left)) {
		float: left;
		margin: 1rem 1.25rem 1rem 0;
	}

	:global(.uncial-nodeview:has(.uncial-wagtail-image-editor--right)) {
		float: right;
		margin: 1rem 0 1rem 1.25rem;
	}

	:global(.uncial-nodeview:has(.uncial-wagtail-image-editor--full-width)) {
		clear: both;
	}

	.preview {
		display: block;
		max-width: 100%;
		height: auto;
		border-radius: 0.375rem;
	}

	.uncial-wagtail-image-editor--left .preview,
	.uncial-wagtail-image-editor--right .preview {
		width: 100%;
	}

	.uncial-wagtail-image-editor--full-width .preview {
		width: 100%;
	}

	.uncial-wagtail-image-editor--right {
		justify-items: end;
	}

	@media (max-width: 40rem) {
		:global(.uncial-nodeview:has(.uncial-wagtail-image-editor--left)),
		:global(.uncial-nodeview:has(.uncial-wagtail-image-editor--right)) {
			float: none;
			width: 100%;
			max-width: none;
			margin-inline: 0;
		}

		.uncial-wagtail-image-editor--left .preview,
		.uncial-wagtail-image-editor--right .preview {
			width: 100%;
		}
	}

	.placeholder {
		border: 1px dashed color-mix(in srgb, currentColor 35%, transparent);
		border-radius: 0.5rem;
		padding: 2rem;
		text-align: center;
		opacity: 0.7;
	}
</style>
