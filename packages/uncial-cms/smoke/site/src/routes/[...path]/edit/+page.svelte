<script lang="ts">
	import { EditorPage } from 'uncial-cms/svelte';
	import { blocks, schema, site } from '../../site.js';

	let { data } = $props();
</script>

<EditorPage {site} sourcePath={data.sourcePath} pagePath={data.pagePath} {blocks} {schema} />
