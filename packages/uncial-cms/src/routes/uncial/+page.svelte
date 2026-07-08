<script lang="ts">
	// '/uncial/' site-index shell. Create/delete and the fallback editor are a
	// later slice (issue 04); this page renders the stub and its mount points.
	let { data } = $props();
</script>

<svelte:head>
	<title>Site index · uncial-cms demo</title>
</svelte:head>

<h1>Site index</h1>
<p>
	This site edits <code>{data.config.repo}</code> on branch
	<code>{data.config.branch}</code> (content in <code>{data.config.contentDir}</code>).
</p>
<p>Page creation, deletion, and the fallback editor are coming in a later release.</p>

<div id="uncial-cms-index-actions" hidden></div>
<div id="uncial-cms-fallback-editor" hidden></div>
