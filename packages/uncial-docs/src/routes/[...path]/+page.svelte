<script lang="ts">
	// Production docs page: renders via uncial's SSR entries only. It must ship
	// zero uncial-cms JavaScript (asserted by assert:clean-pages in a later slice)
	// — do not import mountEditorPage / the uncial-cms runtime here.
	import { Renderer } from 'uncial/render';
	import { blocks, schema } from '../site.js';

	let { data } = $props();
	const title = $derived(String(data.meta.title ?? 'Untitled page'));
</script>

<svelte:head>
	<title>{title} · Uncial Docs</title>
</svelte:head>

<main class="mx-auto max-w-3xl px-6 py-10 sm:px-10">
	<article class="uncial-rich-content space-y-6">
		<h1 class="font-vellum-display text-4xl font-bold">{title}</h1>
		<Renderer content={data.document} {blocks} {schema} />
	</article>
</main>
