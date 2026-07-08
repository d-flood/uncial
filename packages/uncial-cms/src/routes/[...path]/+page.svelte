<script lang="ts">
	// Production content page: renders via uncial's SSR entries only.
	// It must ship zero uncial-cms JavaScript (asserted by assert:clean-pages).
	import { Renderer } from 'uncial/render';
	import { blocks, schema } from '../site.js';

	let { data } = $props();
	const title = $derived(String(data.meta.title ?? 'Untitled page'));
</script>

<svelte:head>
	<title>{title} · uncial-cms demo</title>
</svelte:head>

<article>
	<h1>{title}</h1>
	<Renderer content={data.document} {blocks} {schema} />
</article>
