<script lang="ts">
	import { resolve } from '$app/paths';
	import { Dashboard } from '$lib/svelte/index.js';
	import { site } from '../site.js';

	const appSections = [
		{ id: 'redirects', label: 'Redirects' },
		{ id: 'about', label: 'About page', href: resolve('/about') }
	];
</script>

<svelte:head>
	<title>Dashboard · uncial-cms demo</title>
</svelte:head>

<Dashboard {site} {appSections}>
	{#snippet children()}
		<div slot="redirects" class="redirects">
			<p>Redirects the host site serves:</p>
			<ul>
				<li><code>/blog/</code> → <code>/news/</code></li>
			</ul>
		</div>
	{/snippet}
</Dashboard>

<style>
	.redirects {
		padding: 1rem;
		border-left: 4px solid currentColor;
	}

	.redirects p {
		margin: 0;
	}
</style>
