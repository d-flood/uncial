<script lang="ts">
	// Production docs page: it must ship zero uncial-cms runtime (asserted by
	// assert:clean-pages), so it imports no editor surface.
	import { Page } from 'uncial-cms/svelte';
	import { site } from '../site.js';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.meta.title} · Uncial Docs</title>
</svelte:head>

<Page {site} {data} />
