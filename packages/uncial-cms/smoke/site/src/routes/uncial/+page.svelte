<script lang="ts">
	import { onMount } from 'svelte';
	import { mountIndexPage } from 'uncial-cms';
	// The pure mapping subpath, imported by the one page that is allowed CMS JS.
	import { hashForPagePath } from 'uncial-cms/paths';
	import { blocks, schema, site } from '../site.js';

	let { data } = $props();
	let target: HTMLElement;

	onMount(() => {
		const handle = mountIndexPage(target, { config: site.config, blocks, schema });
		return () => handle.destroy();
	});
</script>

<h1>Site index</h1>
<!-- Rendered as text, not a link: the prerenderer resolves in-page anchors, and
     the fallback editor's hash routes exist only at runtime. -->
<p>Editing {data.config.contentDir}. The home page is at <code>{hashForPagePath('')}</code>.</p>
<div bind:this={target}></div>
