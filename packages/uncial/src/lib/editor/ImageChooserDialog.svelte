<script lang="ts" module>
	let nextDialogId = 0;
</script>

<script lang="ts">
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import type { Component } from 'svelte';
	import type { ImageChooser, ImageChooserProps } from '../core/types.js';

	interface Props {
		value: unknown;
		onChoose: (value: unknown) => void;
	}

	let { value, onChoose }: Props = $props();

	const titleId = `uncial-image-chooser-${nextDialogId++}`;
	let dialog = $state<HTMLDialogElement>();
	let label = $state('');
	let chooser = $state<Promise<Component<ImageChooserProps>>>();

	export function open(next: ImageChooser): void {
		label = next.label;
		chooser = next.component().then((module) => module.default);
		dialog?.showModal();
	}

	function choose(next: unknown): void {
		onChoose(next);
		dialog?.close();
	}

	function message(reason: unknown): string {
		return reason instanceof Error ? reason.message : String(reason);
	}
</script>

<dialog
	bind:this={dialog}
	class="uncial-image-picker"
	aria-labelledby={titleId}
	onclose={() => (chooser = undefined)}
>
	<div class="uncial-image-picker__head">
		<h2 id={titleId} class="uncial-section-label">{label}</h2>
		<button
			type="button"
			class="uncial-btn uncial-btn--ghost uncial-btn--xs uncial-btn--square"
			aria-label="Close"
			onclick={() => dialog?.close()}
		>
			<XIcon size={12} weight="bold" />
		</button>
	</div>
	{#if chooser}
		{#await chooser}
			<p class="uncial-help-text" role="status">Loading…</p>
		{:then Chooser}
			<Chooser {value} {choose} />
		{:catch reason}
			<p class="uncial-field__error" role="alert">{message(reason)}</p>
		{/await}
	{/if}
</dialog>
