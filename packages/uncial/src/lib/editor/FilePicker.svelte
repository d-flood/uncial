<script lang="ts" module>
	let nextPickerId = 0;
</script>

<script lang="ts">
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import type { FileValue } from '../core/types.js';

	interface Props {
		browse: () => Promise<FileValue[]>;
		current?: string;
		onPick: (value: FileValue) => void;
	}

	let { browse, current = '', onPick }: Props = $props();

	const titleId = `uncial-file-picker-${nextPickerId++}`;
	let dialog = $state<HTMLDialogElement>();
	let files = $state<Promise<FileValue[]>>();

	export function open(): void {
		files = browse();
		dialog?.showModal();
	}

	function pick(value: FileValue): void {
		onPick(value);
		dialog?.close();
	}

	function message(reason: unknown): string {
		return reason instanceof Error ? reason.message : String(reason);
	}
</script>

<dialog bind:this={dialog} class="uncial-image-picker" aria-labelledby={titleId}>
	<div class="uncial-image-picker__head">
		<h2 id={titleId} class="uncial-section-label">Choose a file</h2>
		<button
			type="button"
			class="uncial-btn uncial-btn--ghost uncial-btn--xs uncial-btn--square"
			aria-label="Close"
			onclick={() => dialog?.close()}
		>
			<XIcon size={12} weight="bold" />
		</button>
	</div>
	{#if files}
		{#await files}
			<p class="uncial-help-text" role="status">Loading files…</p>
		{:then values}
			{#if values.length === 0}
				<p class="uncial-help-text">No files yet.</p>
			{:else}
				<ul class="uncial-file-picker__list">
					{#each values as value (value.src)}
						<li>
							<button
								type="button"
								class="uncial-file-picker__item"
								aria-pressed={value.src === current}
								onclick={() => pick(value)}
							>
								{value.name}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		{:catch reason}
			<p class="uncial-field__error" role="alert">{message(reason)}</p>
		{/await}
	{/if}
</dialog>
