<script lang="ts">
	import type { ContentSchema } from '../core/types.js';
	import type { PMNode } from '../shared/document.js';
	import type { BlockRegistry } from '../core/types.js';
	import RichNode from './RichNode.svelte';

	export let nodes: PMNode[] = [];
	export let registry: BlockRegistry;
	export let schema: ContentSchema | undefined = undefined;
</script>

{#each nodes as node, index (`${node.type}-${index}`)}
	<RichNode {node} {registry} {schema} />
{/each}
