<script lang="ts" module>
	let nextPickerId = 0;
</script>

<script lang="ts">
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import type { ImagePreviews } from '../shared/imagePreviews.js';

	interface Props {
		browse: () => Promise<string[]>;
		thumbnail?: (src: string) => string;
		imagePreviews?: ImagePreviews;
		current: string;
		onPick: (value: string) => void;
	}

	let { browse, thumbnail, imagePreviews, current, onPick }: Props = $props();

	const titleId = `uncial-image-picker-${nextPickerId++}`;
	let dialog = $state<HTMLDialogElement>();
	let images = $state<Promise<string[]>>();

	export function open(): void {
		images = browse();
		dialog?.showModal();
	}

	function tileSrc(value: string): string {
		return imagePreviews?.get(value) ?? thumbnail?.(value) ?? value;
	}

	// Stored names may be content hashes, so the last path segment is the most
	// a tile can say about itself.
	function fileName(value: string): string {
		return value.split(/[?#]/)[0].split('/').filter(Boolean).at(-1) ?? value;
	}

	function pick(value: string): void {
		onPick(value);
		dialog?.close();
	}

	function message(reason: unknown): string {
		return reason instanceof Error ? reason.message : String(reason);
	}
</script>

<dialog bind:this={dialog} class="uncial-image-picker" aria-labelledby={titleId}>
	<div class="uncial-image-picker__head">
		<h2 id={titleId} class="uncial-section-label">Choose an image</h2>
		<button
			type="button"
			class="uncial-btn uncial-btn--ghost uncial-btn--xs uncial-btn--square"
			aria-label="Close"
			onclick={() => dialog?.close()}
		>
			<XIcon size={12} weight="bold" />
		</button>
	</div>
	{#if images}
		{#await images}
			<p class="uncial-help-text" role="status">Loading images…</p>
		{:then values}
			{#if values.length === 0}
				<p class="uncial-help-text">No images yet.</p>
			{:else}
				<div class="uncial-image-picker__grid">
					{#each values as value (value)}
						<button
							type="button"
							class="uncial-image-picker__tile"
							aria-label={fileName(value)}
							aria-pressed={value === current}
							onclick={() => pick(value)}
						>
							<img src={tileSrc(value)} alt="" loading="lazy" />
						</button>
					{/each}
				</div>
			{/if}
		{:catch reason}
			<p class="uncial-field__error" role="alert">{message(reason)}</p>
		{/await}
	{/if}
</dialog>
