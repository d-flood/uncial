<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getTabSelection } from './tabSelection.svelte.js';

	interface Props {
		label?: string;
		tabsGroup?: string;
		tabsLabels?: string[];
		children?: Snippet;
	}

	let { label = '', tabsGroup = undefined, tabsLabels = [], children }: Props = $props();

	const normalizedLabel = $derived(label.trim());
	const selection = $derived.by(() => (tabsGroup ? getTabSelection(tabsGroup) : null));
	const activeTab = $derived.by(() => {
		if (!selection) return true;
		const selected = selection.value;
		return (tabsLabels.includes(selected) ? selected : tabsLabels[0]) === normalizedLabel;
	});
</script>

<section role={tabsGroup ? 'tabpanel' : undefined} aria-label={normalizedLabel} hidden={!activeTab}>
	{#if children}
		{@render children()}
	{/if}
</section>
