<script lang="ts">
	import { EditorPage } from '$lib/svelte/index.js';
	import { site } from '../../site.js';

	let { data } = $props();
</script>

<svelte:head>
	<title>Edit {data.pagePath === '' ? 'home' : data.pagePath} · uncial-cms demo</title>
</svelte:head>

<h1>Editing <code>{data.sourcePath}</code></h1>
<EditorPage {site} {data} />
