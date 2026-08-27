<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { PMNode } from '../shared/document.js';
	import { getTabSelection, loadTabSelection, saveTabSelection } from './tabSelection.svelte.js';

	interface Props {
		group?: string;
		content?: PMNode[];
		children?: Snippet;
	}

	let { group = '', content = [], children }: Props = $props();

	const tabs = $derived.by(() =>
		content.flatMap((node) => {
			if (node.type !== 'tab' || typeof node.attrs?.label !== 'string') return [];
			const label = node.attrs.label.trim();
			return label ? [label] : [];
		})
	);
	const selection = $derived.by(() => (group ? getTabSelection(group) : null));
	const activeTab = $derived.by(() => {
		if (!selection) return tabs[0] ?? '';
		return tabs.includes(selection.value) ? selection.value : (tabs[0] ?? '');
	});

	$effect(() => {
		if (!selection) return;
		loadTabSelection(group, selection);
		saveTabSelection(group, selection);
	});

	function selectTab(label: string): void {
		if (!selection) return;
		selection.value = label;
		saveTabSelection(group, selection);
	}
</script>

<section class="uncial-tabs">
	<div role="tablist" aria-label={`${group} tabs`}>
		{#each tabs as tab}
			<button
				type="button"
				role="tab"
				aria-selected={activeTab === tab}
				tabindex={activeTab === tab ? 0 : -1}
				onclick={() => selectTab(tab)}>{tab}</button
			>
		{/each}
	</div>
	<div class="uncial-tabs-content">
		{#if children}
			{@render children()}
		{/if}
	</div>
</section>
