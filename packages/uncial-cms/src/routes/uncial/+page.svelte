<script lang="ts">
	import { onMount } from 'svelte';
	import { base, resolve } from '$app/paths';
	import '$lib/dashboard/element.js';
	import { blocks, globals, schema, siteConfig, staticDir } from '../site.js';

	const appSections = [
		{ id: 'redirects', label: 'Redirects' },
		{ id: 'about', label: 'About page', href: resolve('/about') }
	];

	let mounted = $state(false);
	onMount(() => (mounted = true));
</script>

<svelte:head>
	<title>Dashboard · uncial-cms demo</title>
</svelte:head>

{#if mounted}
	<uncial-dashboard
		config={siteConfig}
		{blocks}
		{schema}
		{globals}
		{staticDir}
		{appSections}
		basePath={base}
	>
		<div slot="redirects" class="redirects">
			<p>Redirects the host site serves:</p>
			<ul>
				<li><code>/blog/</code> → <code>/news/</code></li>
			</ul>
		</div>
	</uncial-dashboard>
{/if}

<style>
	.redirects {
		padding: 1rem;
		border-left: 4px solid currentColor;
	}

	.redirects p {
		margin: 0;
	}
</style>
