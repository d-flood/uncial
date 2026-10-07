<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import 'uncial-cms/dashboard';
	import { STATIC_DIR } from '$lib/site.js';
	import { blocks, schema, site } from '../site.js';

	let mounted = $state(false);
	onMount(() => (mounted = true));
</script>

<svelte:head>
	<title>Dashboard · Uncial Docs</title>
</svelte:head>

<main class="mx-auto max-w-5xl px-4 py-10 sm:px-10">
	{#if mounted}
		<uncial-dashboard config={site} {blocks} {schema} staticDir={STATIC_DIR} basePath={base}
		></uncial-dashboard>
	{/if}
</main>
