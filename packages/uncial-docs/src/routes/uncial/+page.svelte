<script lang="ts">
	// '/uncial/' site index: list/create/delete pages and the hash-routed
	// fallback editor, all provided by the framework-agnostic runtime.
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { mountIndexPage } from 'uncial-cms';
	import { blocks, schema, siteConfig } from '../site.js';

	let { data } = $props();
	let target: HTMLElement;

	onMount(() => {
		const handle = mountIndexPage(target, {
			config: siteConfig,
			blocks,
			schema,
			basePath: base
			// Uses the default popupSessionProvider; authWorkerUrl is set in site.ts.
		});
		return () => handle.destroy();
	});
</script>

<svelte:head>
	<title>Site index · Uncial Docs</title>
</svelte:head>

<main class="mx-auto max-w-3xl px-6 py-10 sm:px-10">
	<h1 class="font-vellum-display mb-4 text-2xl font-bold">Site index</h1>
	<p class="mb-6">
		This site edits <code>{data.config.repo}</code> on branch
		<code>{data.config.branch}</code> (content in <code>{data.config.contentDir}</code>).
	</p>

	<div bind:this={target}></div>
</main>
