<script lang="ts">
	import { EditorPage } from 'uncial-cms/svelte';
	import { site } from '../../site.js';

	let { data } = $props();
</script>

<svelte:head>
	<title>Edit {data.pagePath === '' ? 'home' : data.pagePath} · Uncial Docs</title>
</svelte:head>

<EditorPage {site} {data} />
