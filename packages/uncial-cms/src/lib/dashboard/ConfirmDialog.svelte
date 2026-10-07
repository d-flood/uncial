<svelte:options css="injected" />

<script lang="ts">
	import { onMount, type Snippet } from 'svelte';

	interface Props {
		title: string;
		confirmLabel: string;
		onclose: (confirmed: boolean) => void;
		children: Snippet;
	}

	let { title, confirmLabel, onclose, children }: Props = $props();

	const uid = $props.id();
	let dialog = $state<HTMLDialogElement>();
	let cancel = $state<HTMLButtonElement>();
	// The close event lands a task after Escape, by when the parent may have opened another dialog.
	let mounted = true;

	onMount(() => {
		dialog?.showModal();
		cancel?.focus();
		return () => (mounted = false);
	});
</script>

<dialog
	bind:this={dialog}
	class="dialog"
	aria-labelledby="{uid}-title"
	aria-describedby="{uid}-body"
	onclose={() => mounted && onclose(dialog?.returnValue === 'confirm')}
>
	<form method="dialog">
		<h2 id="{uid}-title">{title}</h2>
		<div id="{uid}-body" class="body">{@render children()}</div>
		<div class="actions">
			<button bind:this={cancel} value="cancel" class="btn">Cancel</button>
			<button value="confirm" class="btn btn-danger">{confirmLabel}</button>
		</div>
	</form>
</dialog>

<style>
	.dialog {
		width: min(28rem, calc(100vw - 2rem));
		padding: var(--uncial-space-5);
		border: 1px solid var(--uncial-color-border);
		border-radius: var(--uncial-radius-lg);
		background: var(--uncial-color-surface);
		color: var(--uncial-color-text);
		box-shadow: var(--uncial-shadow-md);
	}

	.dialog::backdrop {
		background: rgb(0 0 0 / 0.45);
	}

	h2 {
		margin: 0 0 var(--uncial-space-3);
		font-size: 1.125rem;
	}

	.body {
		margin: 0 0 var(--uncial-space-5);
		overflow-wrap: anywhere;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--uncial-space-2);
	}
</style>
