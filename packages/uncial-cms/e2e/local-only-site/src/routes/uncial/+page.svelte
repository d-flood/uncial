<script lang="ts">
	// The index page's runtime carries the sentinel too, so it gates on the same
	// statically decidable condition `EditorPage` uses: a local-only production
	// build must reach no CMS runtime at all.
	import { onMount } from 'svelte';
	import { blocks, schema, site } from '../site.js';

	let target: HTMLElement;

	onMount(() => {
		if (!import.meta.env.DEV && import.meta.env.UNCIAL_CMS_FORGE === 'none') return;

		let handle: { destroy(): void } | undefined;
		void import('uncial-cms').then((cms) => {
			handle = cms.mountIndexPage(target, { config: site.config, blocks, schema });
		});
		return () => handle?.destroy();
	});
</script>

<h1>Site index</h1>
<div bind:this={target}></div>
