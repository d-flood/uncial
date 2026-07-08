<script lang="ts">
	import { Editor } from '@tiptap/core';
	import type { Component } from 'svelte';
	import { createSubscriber } from 'svelte/reactivity';
	import CodeIcon from 'phosphor-svelte/lib/CodeIcon';
	import CodeBlockIcon from 'phosphor-svelte/lib/CodeBlockIcon';
	import ListBulletsIcon from 'phosphor-svelte/lib/ListBulletsIcon';
	import ListNumbersIcon from 'phosphor-svelte/lib/ListNumbersIcon';
	import MinusIcon from 'phosphor-svelte/lib/MinusIcon';
	import QuotesIcon from 'phosphor-svelte/lib/QuotesIcon';
	import TextBIcon from 'phosphor-svelte/lib/TextBIcon';
	import TextHThreeIcon from 'phosphor-svelte/lib/TextHThreeIcon';
	import TextItalicIcon from 'phosphor-svelte/lib/TextItalicIcon';
	import TextStrikethroughIcon from 'phosphor-svelte/lib/TextStrikethroughIcon';
	import { untrack } from 'svelte';
	import type { PMDoc } from '../shared/document.js';
	import { coerceRichTextDocument, resolveRichTextFeatures } from '../shared/richText.js';
	import { createRichTextExtensions } from '../shared/tiptap.js';
	import type { RichTextFeature, RichTextFeatureSelection } from '../core/types.js';
	import { richTextAttributeToolbarFeatures, type ToolbarFeature } from './toolbarFeatures.js';

	interface Props {
		value?: unknown;
		features?: RichTextFeatureSelection;
		placeholder?: string;
		onChange: (value: PMDoc) => void;
	}

	let {
		value = undefined,
		features = undefined,
		placeholder = 'Write rich text...',
		onChange
	}: Props = $props();

	let element = $state<HTMLElement>();
	let editor = $state.raw<Editor | null>(null);
	let lastJson = '';

	const resolvedFeatures = $derived(resolveRichTextFeatures(features));
	const visibleFeatures = $derived(
		richTextAttributeToolbarFeatures.filter((feature) =>
			resolvedFeatures.has(feature.id as RichTextFeature)
		)
	);

	const getEditorStateVersion = $derived.by(() => {
		if (!editor) return () => 0;
		const activeEditor = editor;

		let version = 0;
		const subscribe = createSubscriber((update) => {
			const refreshToolbarState = () => {
				version += 1;
				update();
			};

			activeEditor.on('transaction', refreshToolbarState);
			activeEditor.on('selectionUpdate', refreshToolbarState);
			activeEditor.on('update', refreshToolbarState);

			return () => {
				activeEditor.off('transaction', refreshToolbarState);
				activeEditor.off('selectionUpdate', refreshToolbarState);
				activeEditor.off('update', refreshToolbarState);
			};
		});

		return () => {
			subscribe();
			return version;
		};
	});
	const toolbarContext = $derived.by(() => {
		getEditorStateVersion();
		return editor ? { editor } : null;
	});

	function emitChange(nextEditor: Editor): void {
		const json = nextEditor.getJSON() as PMDoc;
		lastJson = JSON.stringify(json);
		onChange(json);
	}

	function runFeature(feature: ToolbarFeature): void {
		if (!editor) return;
		feature.run({ editor });
	}

	function iconFor(featureId: string): Component<Record<string, unknown>> | null {
		return (
			{
				bold: TextBIcon,
				italic: TextItalicIcon,
				strike: TextStrikethroughIcon,
				code: CodeIcon,
				heading: TextHThreeIcon,
				bulletList: ListBulletsIcon,
				orderedList: ListNumbersIcon,
				blockquote: QuotesIcon,
				codeBlock: CodeBlockIcon,
				horizontalRule: MinusIcon
			}[featureId] ?? null
		);
	}

	const iconSize = 14;

	$effect(() => {
		if (!element) return;

		const initialContent = untrack(() => coerceRichTextDocument(value));
		lastJson = JSON.stringify(initialContent);
		const nextEditor = new Editor({
			element,
			content: initialContent,
			extensions: createRichTextExtensions(resolvedFeatures),
			editorProps: {
				attributes: {
					class: 'uncial-richtext-editor uncial-rich-content',
					'aria-label': placeholder
				}
			},
			onUpdate: ({ editor: updatedEditor }) => {
				emitChange(updatedEditor);
			}
		});

		editor = nextEditor;

		return () => {
			nextEditor.destroy();
			editor = null;
		};
	});

	$effect(() => {
		if (!editor) return;
		const nextContent = coerceRichTextDocument(value);
		const nextJson = JSON.stringify(nextContent);
		if (nextJson === lastJson) return;
		lastJson = nextJson;
		editor.commands.setContent(nextContent, { emitUpdate: false });
	});
</script>

<div class="uncial-richtext-wrapper">
	<div class="uncial-richtext-toolbar">
		{#each visibleFeatures as feature (feature.id)}
			{@const context = toolbarContext}
			{@const Icon = iconFor(feature.id)}
			{@const active = context ? (feature.isActive?.(context) ?? false) : false}
			<button
				type="button"
				class={[
					'uncial-btn uncial-btn--square uncial-btn--xs uncial-tooltip',
					active ? 'uncial-btn--active' : 'uncial-btn--ghost'
				]}
				aria-label={feature.label}
				data-tip={feature.tooltip ?? feature.label}
				onclick={() => runFeature(feature)}
			>
				{#if Icon}
					<Icon size={iconSize} weight="bold" />
				{:else}
					{feature.label}
				{/if}
			</button>
		{/each}
	</div>
	<div bind:this={element}></div>
</div>
