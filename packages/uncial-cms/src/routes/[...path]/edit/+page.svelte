<script lang="ts">
	// Editor variant: prerendered page shell; the document itself is always
	// fetched live from the forge by mountEditorPage — never baked in.
	import { onMount } from 'svelte';
	import { mountEditorPage } from '$lib/index.js';
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
	<title>Edit {data.path === '' ? 'home' : data.path} · uncial-cms demo</title>
</svelte:head>

<h1>Editing <code>{data.sourcePath}</code></h1>
<div bind:this={target}></div>

<style>
	div :global(.uncial-cms-chrome) {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		margin-bottom: 1rem;
	}
	div :global(.uncial-cms-banner) {
		border: 1px solid #b91c1c;
		color: #b91c1c;
		padding: 0.5rem 0.75rem;
		margin-bottom: 1rem;
	}
</style>
