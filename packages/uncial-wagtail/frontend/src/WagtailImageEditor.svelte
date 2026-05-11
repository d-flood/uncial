<script lang="ts">
	interface Props {
		imageId?: number | null;
		alt?: string;
		rendition?: string;
		decorative?: boolean;
		previewUrl?: string;
	}

	let {
		imageId = null,
		alt = '',
		rendition = 'width-1200',
		decorative = false,
		previewUrl = ''
	}: Props = $props();

	let editorPreviewUrl = $derived(previewUrl || (imageId ? `/api/uncial/images/${imageId}/preview/` : ''));
</script>

<div class="uncial-wagtail-image-editor" aria-label="Wagtail image block">
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
	}

	.preview {
		display: block;
		max-width: min(100%, 28rem);
		height: auto;
		border-radius: 0.375rem;
	}

	.placeholder {
		border: 1px dashed color-mix(in srgb, currentColor 35%, transparent);
		border-radius: 0.5rem;
		padding: 2rem;
		text-align: center;
		opacity: 0.7;
	}
</style>
