<script lang="ts">
	// '/uncial/' site index: list/create/delete pages and the hash-routed
	// fallback editor, all provided by the framework-agnostic runtime.
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { mountIndexPage, patSessionProvider } from '$lib/index.js';
	import { blocks, schema, siteConfig } from '../site.js';

	let { data } = $props();
	let target: HTMLElement;

	onMount(() => {
		const handle = mountIndexPage(target, {
			config: siteConfig,
			blocks,
			schema,
			basePath: base,
			// The demo stays on PAT until the canonical worker is deployed and
			// authWorkerUrl is set (issue 03 human-validation step flips this).
			sessionProvider: patSessionProvider
		});
		return () => handle.destroy();
	});
</script>

<svelte:head>
	<title>Site index · uncial-cms demo</title>
</svelte:head>

<h1>Site index</h1>
<p>
	This site edits <code>{data.config.repo}</code> on branch
	<code>{data.config.branch}</code> (content in <code>{data.config.contentDir}</code>).
</p>

<div bind:this={target}></div>
