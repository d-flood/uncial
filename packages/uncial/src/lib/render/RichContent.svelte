<script lang="ts">
	import type { BlockRegistry, ContentSchema } from '../core/types.js';
	import type { PMNode } from '../shared/document.js';
	import RichNode from './RichNode.svelte';

	interface Props {
		nodes?: PMNode[];
		registry: BlockRegistry;
		schema?: ContentSchema;
	}

	let { nodes = [], registry, schema = undefined }: Props = $props();

	function getNodeKey(node: PMNode, index: number): string {
		const id = node.attrs?.id;
		if (typeof id === 'string' || typeof id === 'number') {
			return `${node.type}:${id}`;
		}

		if (typeof node.text === 'string' && node.text.length > 0) {
			return `${node.type}:${node.text}`;
		}

		return `${node.type}:${JSON.stringify(node.attrs ?? {})}:${index}`;
	}
</script>

{#each nodes as node, index (getNodeKey(node, index))}
	<RichNode {node} {registry} {schema} />
{/each}
