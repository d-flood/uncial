<script lang="ts">
	// The Dashboard's runtime carries the sentinel too, so it gates on the same
	// statically decidable condition `EditorPage` uses: a local-only production
	// build must reach no CMS runtime at all.
	import { onMount } from 'svelte';
	import { blocks, schema, site } from '../site.js';

	const appSections = [{ id: 'redirects', label: 'Redirects' }];

	let mounted = $state(false);

	onMount(() => {
		if (!import.meta.env.DEV && import.meta.env.UNCIAL_CMS_FORGE === 'none') return;
		void import('uncial-cms/dashboard').then(() => (mounted = true));
	});
</script>

<svelte:head>
	<title>Dashboard · local-only fixture</title>
</svelte:head>

{#if mounted}
	<uncial-dashboard config={site} {blocks} {schema} {appSections}>
		<div slot="redirects">
			<p>Redirects the host site serves:</p>
			<ul>
				<li><code>/blog/</code> → <code>/news/</code></li>
			</ul>
		</div>
	</uncial-dashboard>
{/if}
