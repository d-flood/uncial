<script lang="ts">
	import { EditorPage } from 'uncial-cms/svelte';
	import { site } from '../../site.js';

	let { data } = $props();
</script>

<EditorPage {site} {data} />
