<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { FocalPoint, ImageValue } from '../core/types.js';
	import { stripBase } from '../render/resolveImageSrc.js';
	import type { FieldEditorProps } from '../runtime/fields.js';
	import { getFieldEditing } from './fieldEditing.js';
	import FocalPointPicker from './FocalPointPicker.svelte';
	import ImagePicker from './ImagePicker.svelte';

	let { scope, name, alt, ...rest }: FieldEditorProps & { alt?: string } & Record<string, unknown> =
		$props();

	const { imagePreviews } = getFieldEditing();
	const value = $derived(scope.value(name));
	const spec = $derived(scope.spec(name));
	// An image attribute whose default is not a string stores `{ src, focal? }`.
	const imageObject = $derived(
		spec ? typeof spec.default !== 'string' : typeof value === 'object' && value !== null
	);
	const imageValue = $derived(
		imageObject && value !== null && typeof value === 'object' ? (value as ImageValue) : null
	);
	// The scope holds displayed values: a preview or a base-resolved URL.
	const displaySrc = $derived(
		imageObject ? (imageValue?.src ?? '') : typeof value === 'string' ? value : ''
	);
	const src = $derived(
		displaySrc && (imagePreviews?.sourceOf(displaySrc) ?? stripBase(displaySrc, scope.base))
	);
	const hasAlt = $derived(alt === undefined && name !== 'alt' && scope.has('alt'));
	const altText = $derived(alt ?? (hasAlt ? String(scope.value('alt') ?? '') : ''));
	const upload = $derived(scope.media?.upload);
	const browse = $derived(scope.media?.browse);

	let fileInput = $state<HTMLInputElement>();
	let picker = $state<ImagePicker>();
	let showFocal = $state(false);
	let uploading = $state(false);
	let uploadError = $state('');
	let destroyed = false;
	onDestroy(() => (destroyed = true));

	function setSrc(next: string): void {
		scope.set(name, imageObject ? (next ? { src: next } : null) : next);
	}

	function setFocal(focal: FocalPoint | undefined): void {
		if (!imageValue) return;
		const next: ImageValue = { ...imageValue, focal };
		if (!focal) delete next.focal;
		scope.set(name, next);
	}

	async function uploadImage(file: File, send: (file: File) => Promise<string>): Promise<void> {
		uploading = true;
		uploadError = '';
		try {
			const stored = await send(file);
			imagePreviews?.register(stored, file);
			if (!destroyed) setSrc(stored);
		} catch (reason) {
			uploadError = reason instanceof Error ? reason.message : String(reason);
		} finally {
			uploading = false;
		}
	}
</script>

<span class="uncial-image-field-inline">
	{#if displaySrc}
		<img {...rest} src={displaySrc} alt={altText} />
	{:else}
		<span class="uncial-image-field-inline__empty">No image</span>
	{/if}
	<span class="uncial-image-field-inline__bar" data-uncial-field>
		{#if upload}
			<input
				bind:this={fileInput}
				type="file"
				accept="image/*"
				hidden
				onchange={(event) => {
					const file = event.currentTarget.files?.[0];
					// Reset so picking the same file again still fires `change`.
					event.currentTarget.value = '';
					if (file) void uploadImage(file, upload);
				}}
			/>
			<button
				type="button"
				class="uncial-btn uncial-btn--outline uncial-btn--xs"
				disabled={uploading}
				onclick={() => fileInput?.click()}>Upload image</button
			>
		{/if}
		{#if browse}
			<button
				type="button"
				class="uncial-btn uncial-btn--outline uncial-btn--xs"
				disabled={uploading}
				onclick={() => picker?.open()}>Choose image</button
			>
			<ImagePicker
				bind:this={picker}
				{browse}
				thumbnail={scope.media?.thumbnail}
				{imagePreviews}
				current={src}
				onPick={setSrc}
			/>
		{/if}
		{#if imageValue && displaySrc}
			<button
				type="button"
				class="uncial-btn uncial-btn--outline uncial-btn--xs"
				aria-pressed={showFocal}
				onclick={() => (showFocal = !showFocal)}>Focal point</button
			>
		{/if}
		{#if hasAlt}
			<input
				class="uncial-input uncial-input--xs"
				type="text"
				aria-label="Alt text"
				placeholder="Alt text"
				value={altText}
				onchange={(event) => scope.set('alt', event.currentTarget.value)}
			/>
		{/if}
		{#if uploading}
			<span class="uncial-help-text" role="status">Uploading…</span>
		{/if}
		{#if uploadError}
			<span class="uncial-field__error" role="alert">{uploadError}</span>
		{/if}
	</span>
	{#if showFocal && imageValue && displaySrc}
		<span class="uncial-image-field-inline__focal" data-uncial-field>
			<FocalPointPicker src={displaySrc} focal={imageValue.focal} onChange={setFocal} />
		</span>
	{/if}
</span>
