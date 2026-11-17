<script lang="ts">
	import { Dashboard } from 'uncial-cms/svelte';
	import { site } from '../site.js';

	const appSections = [{ id: 'redirects', label: 'Redirects' }];
</script>

<svelte:head>
	<title>Dashboard · local-only fixture</title>
</svelte:head>

<Dashboard {site} {appSections}>
	{#snippet children()}
		<div slot="redirects">
			<p>Redirects the host site serves:</p>
			<ul>
				<li><code>/blog/</code> → <code>/news/</code></li>
			</ul>
		</div>
	{/snippet}
</Dashboard>
