<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { FileValue } from '../core/types.js';
	import FilePicker from './FilePicker.svelte';
	import type { FileSource } from './fileSource.js';

	interface Props {
		source: FileSource;
		current?: string;
		accept?: string;
		onPick: (value: FileValue) => void;
	}

	let { source, current = '', accept, onPick }: Props = $props();

	let fileInput = $state<HTMLInputElement>();
	let picker = $state<FilePicker>();
	let uploading = $state(false);
	let uploadError = $state('');

	// A result arriving after the control is gone belongs to nothing on screen.
	let destroyed = false;
	onDestroy(() => (destroyed = true));

	async function uploadFile(file: File, upload: NonNullable<FileSource['upload']>): Promise<void> {
		uploading = true;
		uploadError = '';
		try {
			const value = await upload(file);
			if (!destroyed) onPick(value);
		} catch (reason) {
			uploadError = reason instanceof Error ? reason.message : String(reason);
		} finally {
			uploading = false;
		}
	}
</script>

<div class="uncial-image-field__actions">
	{#if source.upload}
		{@const upload = source.upload}
		<input
			bind:this={fileInput}
			type="file"
			{accept}
			hidden
			onchange={(event) => {
				const target = event.currentTarget as HTMLInputElement;
				const file = target.files?.[0];
				target.value = '';
				if (file) void uploadFile(file, upload);
			}}
		/>
		<button
			type="button"
			class="uncial-btn uncial-btn--outline uncial-btn--sm"
			disabled={uploading}
			onclick={() => fileInput?.click()}
		>
			Upload
		</button>
	{/if}
	{#if source.browse}
		<button
			type="button"
			class="uncial-btn uncial-btn--outline uncial-btn--sm"
			disabled={uploading}
			onclick={() => picker?.open()}
		>
			Choose existing
		</button>
		<FilePicker bind:this={picker} browse={source.browse} {current} {onPick} />
	{/if}
</div>
{#if uploading}
	<span class="uncial-help-text" role="status">Uploading…</span>
{/if}
{#if uploadError}
	<span class="uncial-field__error" role="alert">{uploadError}</span>
{/if}
