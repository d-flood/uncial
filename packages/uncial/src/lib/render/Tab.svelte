<script module lang="ts">
	import { defineBlock } from '../model.js';

	const isNonEmptyString = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

	export const block = defineBlock({
		id: 'tab',
		label: 'Tab',
		description: 'One labelled panel inside a tabs block.',
		attributes: {
			label: { default: '', required: true, validate: isNonEmptyString, placeholder: 'Vue' }
		},
		content: { kind: 'flow' }
	});
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getBlock } from '../runtime/blockContext.js';
	import { getTabSelection } from './tabSelection.svelte.js';

	interface Props {
		label?: string;
		children?: Snippet;
	}

	let { label = '', children }: Props = $props();

	const block = getBlock();
	const normalizedLabel = $derived(label.trim());
	// Authors edit every panel, so the editor shows them all.
	const group = $derived(
		!block.editing && block.parent?.type === 'tabs' ? String(block.parent.attrs.group).trim() : ''
	);
	const labels = $derived(
		block.siblings.flatMap(({ type, attrs }) =>
			type === 'tab' && typeof attrs.label === 'string' && attrs.label.trim()
				? [attrs.label.trim()]
				: []
		)
	);
	const selection = $derived.by(() => (group ? getTabSelection(group) : null));
	const activeTab = $derived.by(() => {
		if (!selection) return true;
		const selected = selection.value;
		return (labels.includes(selected) ? selected : labels[0]) === normalizedLabel;
	});
</script>

<section role={group ? 'tabpanel' : undefined} aria-label={normalizedLabel} hidden={!activeTab}>
	{#if children}
		{@render children()}
	{/if}
</section>
