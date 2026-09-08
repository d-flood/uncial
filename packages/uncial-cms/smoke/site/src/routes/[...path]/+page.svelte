<script lang="ts">
	import { Renderer } from 'uncial/render';
	import { blocks, schema } from '../site.js';

	let { data } = $props();
</script>

<h1>{data.meta.title}</h1>
<p data-page-path={data.path} data-banner={data.banner}></p>
<Renderer content={data.document} {blocks} {schema} />
