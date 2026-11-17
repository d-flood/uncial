<script lang="ts">
	// Production content page: it must ship zero uncial-cms runtime (asserted by
	// assert:clean-pages).
	import { Page } from '$lib/svelte/index.js';
	import { site } from '../site.js';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.meta.title} · uncial-cms demo</title>
</svelte:head>

<article>
	<h1>{data.meta.title}</h1>
	<Page {site} {data} />
</article>
