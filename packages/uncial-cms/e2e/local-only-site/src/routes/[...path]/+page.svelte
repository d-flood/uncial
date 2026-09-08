<script lang="ts">
	import { Renderer } from 'uncial/render';
	import { blocks, schema } from '../site.js';

	let { data } = $props();
</script>

<h1>{data.meta.title}</h1>
<Renderer content={data.document} {blocks} {schema} />
