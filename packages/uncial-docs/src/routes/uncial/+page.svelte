<script lang="ts">
	import { Dashboard } from 'uncial-cms/svelte';
	import { site } from '../site.js';
</script>

<svelte:head>
	<title>Dashboard · Uncial Docs</title>
</svelte:head>

<main class="mx-auto max-w-5xl px-4 py-10 sm:px-10">
	<Dashboard {site} />
</main>
