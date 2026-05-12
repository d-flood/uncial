<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import type { Component } from 'svelte';
	import CodeIcon from 'phosphor-svelte/lib/CodeIcon';
	import CodeBlockIcon from 'phosphor-svelte/lib/CodeBlockIcon';
	import LinkIcon from 'phosphor-svelte/lib/LinkIcon';
	import ListBulletsIcon from 'phosphor-svelte/lib/ListBulletsIcon';
	import ListNumbersIcon from 'phosphor-svelte/lib/ListNumbersIcon';
	import MinusIcon from 'phosphor-svelte/lib/MinusIcon';
	import QuotesIcon from 'phosphor-svelte/lib/QuotesIcon';
	import TextBIcon from 'phosphor-svelte/lib/TextBIcon';
	import TextHFiveIcon from 'phosphor-svelte/lib/TextHFiveIcon';
	import TextHFourIcon from 'phosphor-svelte/lib/TextHFourIcon';
	import TextHSixIcon from 'phosphor-svelte/lib/TextHSixIcon';
	import TextHThreeIcon from 'phosphor-svelte/lib/TextHThreeIcon';
	import TextHTwoIcon from 'phosphor-svelte/lib/TextHTwoIcon';
	import TextItalicIcon from 'phosphor-svelte/lib/TextItalicIcon';
	import TextStrikethroughIcon from 'phosphor-svelte/lib/TextStrikethroughIcon';
	import type { ContentSchema } from '../core/types.js';
	import {
		resolveToolbarFeatures,
		type ToolbarFeature,
		type ToolbarFeatureSelection
	} from './toolbarFeatures.js';

	interface Props {
		editor?: Editor | null;
		schema?: ContentSchema;
		toolbarFeatures?: ToolbarFeatureSelection;
		toolbarExtensions?: ToolbarFeature[];
		onEditLink?: () => void;
	}

	let {
		editor = null,
		schema = undefined,
		toolbarFeatures = undefined,
		toolbarExtensions = [],
		onEditLink
	}: Props = $props();

	const features = $derived(
		resolveToolbarFeatures({ editor, schema, toolbarFeatures, toolbarExtensions })
	);
	const groupedFeatures = $derived.by(() => {
		const groups: { group: string; features: ToolbarFeature[] }[] = [];
		for (const feature of features) {
			const group = feature.group ?? 'default';
			const existing = groups.find((entry) => entry.group === group);
			if (existing) {
				existing.features.push(feature);
			} else {
				groups.push({ group, features: [feature] });
			}
		}
		return groups;
	});

	function runFeature(feature: ToolbarFeature): void {
		if (feature.id === 'link' && onEditLink) {
			if (editor && !editor.isActive('link')) {
				feature.run({ editor, schema });
			}
			onEditLink();
			return;
		}
		if (!editor) return;
		feature.run({ editor, schema });
	}

	function iconFor(featureId: string): Component<Record<string, unknown>> | null {
		return (
			{
				bold: TextBIcon,
				italic: TextItalicIcon,
				strike: TextStrikethroughIcon,
				code: CodeIcon,
				link: LinkIcon,
				heading2: TextHTwoIcon,
				heading3: TextHThreeIcon,
				heading4: TextHFourIcon,
				heading5: TextHFiveIcon,
				heading6: TextHSixIcon,
				bulletList: ListBulletsIcon,
				orderedList: ListNumbersIcon,
				blockquote: QuotesIcon,
				codeBlock: CodeBlockIcon,
				horizontalRule: MinusIcon
			}[featureId] ?? null
		);
	}
</script>

<div>
	{#each groupedFeatures as group (group.group)}
		<div class="uncial-join">
			{#each group.features as feature (feature.id)}
				{@const context = editor ? { editor, schema } : null}
				{@const Icon = iconFor(feature.id)}
				{@const active = context ? (feature.isActive?.(context) ?? false) : false}
				{@const disabled = !context || !(feature.canRun?.(context) ?? true)}
				<button
					type="button"
					aria-label={feature.label}
					data-tip={feature.tooltip ?? feature.label}
					data-uncial-tooltip-position="bottom"
					aria-pressed={active ? 'true' : 'false'}
					{disabled}
					class={[
						'uncial-btn uncial-btn--sm uncial-join__item uncial-tooltip',
						feature.label.length <= 2 ? 'uncial-btn--square' : '',
						active ? 'uncial-btn--active' : 'uncial-btn--ghost'
					]}
					onclick={() => runFeature(feature)}
				>
					{#if Icon}
						<Icon size={16} weight="bold" />
					{:else}
						{feature.label}
					{/if}
				</button>
			{/each}
		</div>
	{/each}
</div>
