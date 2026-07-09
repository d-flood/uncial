<script lang="ts">
	// Docs Image: an atomic figure with alt text + optional caption. On reader
	// pages it renders a plain <figure> and ships no CMS code. In the editor
	// (where `updateAttributes` is provided) it grows an Upload affordance that
	// commits the chosen file via uncial-cms's uploadAsset and stores the served
	// URL as `src`. uncial-cms is imported *dynamically*, inside the upload
	// handler only, so it never enters the reader page's static import graph
	// (the clean-pages guarantee: content pages carry no editor JS).
	import { MEDIA_DIR, mediaSrcFromPath, withBase } from '$lib/media.js';

	interface Props {
		src?: string;
		alt?: string;
		caption?: string;
		updateAttributes?: (attrs: Record<string, unknown>) => void;
	}

	let { src = '', alt = '', caption = '', updateAttributes }: Props = $props();

	const editable = $derived(typeof updateAttributes === 'function');

	let previewUrl = $state<string | null>(null);
	let error = $state<string | null>(null);
	let busy = $state(false);

	// Prefer the just-uploaded local object URL; the committed copy only serves
	// after the next redeploy, so the preview bridges the gap. The stored `src`
	// is site-root-relative (base-less), so apply the build-time base here — that
	// keeps the same content correct at any `paths.base`.
	const displaySrc = $derived(previewUrl ?? (src ? withBase(src) : ''));

	function clearPreview(): void {
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl);
			previewUrl = null;
		}
	}

	async function onFile(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		error = null;
		clearPreview();
		previewUrl = URL.createObjectURL(file); // immediate feedback, before the commit
		busy = true;
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const { uploadImageAsset } = await import('uncial-cms');
			const result = await uploadImageAsset(
				{ bytes, filename: file.name, contentType: file.type || 'application/octet-stream' },
				{ mediaDir: MEDIA_DIR }
			);
			updateAttributes?.({ src: mediaSrcFromPath(result.path) });
		} catch (err) {
			clearPreview(); // a rejected upload leaves no committed file to preview
			error = err instanceof Error ? err.message : 'Upload failed.';
		} finally {
			busy = false;
			input.value = ''; // let the same file be re-selected after an error
		}
	}
</script>

<figure class="uncial-image my-4">
	{#if displaySrc}
		<img src={displaySrc} {alt} class="max-w-full rounded-box border border-base-content/15" />
	{/if}
	{#if caption}
		<figcaption class="mt-2 text-sm opacity-70">{caption}</figcaption>
	{/if}

	{#if editable}
		<div class="uncial-image-upload mt-2 flex flex-col gap-1">
			<label class="text-sm">
				<span class="mr-2 opacity-70">{displaySrc ? 'Replace image' : 'Upload image'}</span>
				<input
					type="file"
					accept="image/*"
					class="file-input file-input-sm"
					disabled={busy}
					onchange={onFile}
				/>
			</label>
			{#if busy}
				<p class="text-xs opacity-60" role="status">Uploading…</p>
			{/if}
			{#if error}
				<p class="uncial-image-error text-xs text-error" role="alert">{error}</p>
			{/if}
		</div>
	{/if}
</figure>
