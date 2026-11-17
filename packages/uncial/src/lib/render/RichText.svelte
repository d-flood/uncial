<script lang="ts">
	import { createBlockRegistry } from '../core/registry.js';
	import type { ContentSchema, RichTextFeatureSelection } from '../core/types.js';
	import type { PMNode } from '../shared/document.js';
	import {
		coerceRichTextDocument,
		filterRichTextNodes,
		hasRichTextContent,
		resolveRichTextFeatures
	} from '../shared/richText.js';
	import { useField } from '../runtime/fields.js';
	import RichContent from './RichContent.svelte';

	interface Props {
		/** A rich-text value to render. */
		content?: unknown;
		/** A rich-text field to render, and edit in place in the editor. */
		name?: string;
		features?: RichTextFeatureSelection;
	}

	let { content = undefined, name = undefined, features = undefined }: Props = $props();

	const field = useField(() => name ?? '');
	const scope = $derived(name === undefined ? undefined : field.scope);
	const Editing = $derived(scope && field.editors?.richText);
	const value = $derived(name === undefined ? content : scope?.value(name));
	const registry = createBlockRegistry([]);
	const resolvedFeatures = $derived(
		resolveRichTextFeatures(features ?? (name ? scope?.spec(name)?.richText?.features : undefined))
	);
	const nodes = $derived(
		filterRichTextNodes(coerceRichTextDocument(value).content ?? [], resolvedFeatures)
	);
	const schema = $derived<ContentSchema>({
		allowedBlocks: new Set(),
		allowedMarks: resolvedFeatures,
		metaFields: new Map()
	});
</script>

{#if scope && Editing}
	<Editing {scope} name={name!} {features} />
{:else if hasRichTextContent({ type: 'doc', content: nodes })}
	<RichContent nodes={nodes as PMNode[]} {registry} {schema} />
{/if}
