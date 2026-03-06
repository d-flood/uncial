<script lang="ts">
	import type { JSONContent } from '@tiptap/core';
	import type { BlockDefinition, BlockRegistry, ContentSchema } from '../core/types.js';
	import type { PMNode } from '../shared/document.js';
	import { resolveRegistry } from '../core/registry.js';
	import { emptyDocument } from '../shared/tiptap.js';
	import RichContent from './RichContent.svelte';
	import '../styles/uncial.css';

	export let content: JSONContent = emptyDocument();
	export let blocks: BlockRegistry | BlockDefinition[] = [];
	export let schema: ContentSchema | undefined = undefined;

	$: registry = resolveRegistry(blocks);
</script>

<div class="uncial-renderer">
	<div class="uncial-content">
		<RichContent nodes={(content.content ?? []) as PMNode[]} {registry} {schema} />
	</div>
</div>
