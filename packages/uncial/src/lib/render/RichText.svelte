<script lang="ts">
	import { createBlockRegistry } from '../core/registry.js';
	import type { ContentSchema, RichTextFeatureSelection } from '../core/types.js';
	import type { PMNode } from '../shared/document.js';
	import {
		coerceRichTextDocument,
		filterRichTextNodes,
		resolveRichTextFeatures
	} from '../shared/richText.js';
	import RichContent from './RichContent.svelte';

	interface Props {
		content?: unknown;
		features?: RichTextFeatureSelection;
	}

	let { content = undefined, features = undefined }: Props = $props();

	const registry = createBlockRegistry([]);
	const resolvedFeatures = $derived(resolveRichTextFeatures(features));
	const document = $derived(coerceRichTextDocument(content));
	const nodes = $derived(filterRichTextNodes(document.content ?? [], resolvedFeatures));
	const schema = $derived<ContentSchema>({
		allowedBlocks: new Set(),
		allowedMarks: resolvedFeatures
	});
</script>

<RichContent nodes={nodes as PMNode[]} {registry} {schema} />
