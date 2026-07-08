<script lang="ts">
	// Editor variant: prerendered page shell; the document itself is always
	// fetched live from the forge by mountEditorPage — never baked in. This route
	// carries the uncial-cms runtime (and its sentinel).
	import { onMount } from 'svelte';
	import { mountEditorPage } from 'uncial-cms';
	import { blocks, schema, siteConfig } from '../../site.js';

	let { data } = $props();
	let target: HTMLElement;

	onMount(() => {
		const handle = mountEditorPage(target, {
			config: siteConfig,
			sourcePath: data.sourcePath,
			pagePath: data.path,
			blocks,
			schema
			// Uses the default popupSessionProvider; authWorkerUrl is set in site.ts.
		});
		return () => handle.destroy();
	});
</script>

<svelte:head>
	<title>Edit {data.path === '' ? 'home' : data.path} · Uncial Docs</title>
</svelte:head>

<main class="mx-auto max-w-3xl px-6 py-10 sm:px-10">
	<h1 class="font-vellum-display mb-6 text-2xl font-bold">
		Editing <code>{data.sourcePath}</code>
	</h1>
	<div bind:this={target}></div>
</main>

<style>
	div :global(.uncial-cms-chrome) {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		margin-bottom: 1rem;
	}
	div :global(.uncial-cms-banner) {
		border: 1px solid var(--color-error, #b91c1c);
		color: var(--color-error, #b91c1c);
		padding: 0.5rem 0.75rem;
		margin-bottom: 1rem;
	}
</style>
