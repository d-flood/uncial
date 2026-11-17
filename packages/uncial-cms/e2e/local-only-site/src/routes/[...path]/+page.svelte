<script lang="ts">
	import { Page } from 'uncial-cms/svelte';
	import { site } from '../site.js';

	let { data } = $props();
</script>

<h1>{data.meta.title}</h1>
<Page {site} {data} />
