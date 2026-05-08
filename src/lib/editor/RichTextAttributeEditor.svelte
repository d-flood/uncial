<script lang="ts">
	import { Editor } from '@tiptap/core';
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
	import type { RichTextFeatureSelection } from '../core/types.js';

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
	const activeEditor = $derived(editor);
	const canBold = $derived(resolvedFeatures.has('bold'));
	const canItalic = $derived(resolvedFeatures.has('italic'));
	const canStrike = $derived(resolvedFeatures.has('strike'));
	const canCode = $derived(resolvedFeatures.has('code'));
	const canHeading = $derived(resolvedFeatures.has('heading'));
	const canBulletList = $derived(resolvedFeatures.has('bulletList'));
	const canOrderedList = $derived(resolvedFeatures.has('orderedList'));
	const canBlockquote = $derived(resolvedFeatures.has('blockquote'));
	const canCodeBlock = $derived(resolvedFeatures.has('codeBlock'));
	const canHorizontalRule = $derived(resolvedFeatures.has('horizontalRule'));

	function emitChange(nextEditor: Editor): void {
		const json = nextEditor.getJSON() as PMDoc;
		lastJson = JSON.stringify(json);
		onChange(json);
	}

	function runCommand(command: () => boolean): void {
		command();
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
					class:
						'uncial-richtext-editor uncial-rich-content min-h-28 rounded-b-lg border border-t-0 border-base-300 bg-base-100 px-3 py-2 text-sm leading-6 outline-none',
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

<div class="rounded-lg border-base-300">
	<div class="flex flex-wrap gap-1 rounded-t-lg border border-base-300 bg-base-200/70 p-1.5">
		{#if canBold}
			<button
				type="button"
				class="tooltip btn btn-square btn-xs"
				class:btn-active={activeEditor?.isActive('bold')}
				aria-label="Bold"
				data-tip="Bold"
				onclick={() => runCommand(() => editor?.chain().focus().toggleBold().run() ?? false)}
			>
				<TextBIcon size={iconSize} weight="bold" />
			</button>
		{/if}
		{#if canItalic}
			<button
				type="button"
				class="tooltip btn btn-square btn-xs"
				class:btn-active={activeEditor?.isActive('italic')}
				aria-label="Italic"
				data-tip="Italic"
				onclick={() => runCommand(() => editor?.chain().focus().toggleItalic().run() ?? false)}
			>
				<TextItalicIcon size={iconSize} weight="bold" />
			</button>
		{/if}
		{#if canStrike}
			<button
				type="button"
				class="tooltip btn btn-square btn-xs"
				class:btn-active={activeEditor?.isActive('strike')}
				aria-label="Strikethrough"
				data-tip="Strikethrough"
				onclick={() => runCommand(() => editor?.chain().focus().toggleStrike().run() ?? false)}
			>
				<TextStrikethroughIcon size={iconSize} weight="bold" />
			</button>
		{/if}
		{#if canCode}
			<button
				type="button"
				class="tooltip btn btn-square btn-xs"
				class:btn-active={activeEditor?.isActive('code')}
				aria-label="Inline code"
				data-tip="Inline code"
				onclick={() => runCommand(() => editor?.chain().focus().toggleCode().run() ?? false)}
			>
				<CodeIcon size={iconSize} weight="bold" />
			</button>
		{/if}
		{#if canHeading}
			<button
				type="button"
				class="tooltip btn btn-square btn-xs"
				class:btn-active={activeEditor?.isActive('heading')}
				aria-label="Heading"
				data-tip="Heading"
				onclick={() =>
					runCommand(() => editor?.chain().focus().toggleHeading({ level: 3 }).run() ?? false)}
			>
				<TextHThreeIcon size={iconSize} weight="bold" />
			</button>
		{/if}
		{#if canBulletList}
			<button
				type="button"
				class="tooltip btn btn-square btn-xs"
				class:btn-active={activeEditor?.isActive('bulletList')}
				aria-label="Bullet list"
				data-tip="Bullet list"
				onclick={() => runCommand(() => editor?.chain().focus().toggleBulletList().run() ?? false)}
			>
				<ListBulletsIcon size={iconSize} weight="bold" />
			</button>
		{/if}
		{#if canOrderedList}
			<button
				type="button"
				class="tooltip btn btn-square btn-xs"
				class:btn-active={activeEditor?.isActive('orderedList')}
				aria-label="Ordered list"
				data-tip="Ordered list"
				onclick={() => runCommand(() => editor?.chain().focus().toggleOrderedList().run() ?? false)}
			>
				<ListNumbersIcon size={iconSize} weight="bold" />
			</button>
		{/if}
		{#if canBlockquote}
			<button
				type="button"
				class="tooltip btn btn-square btn-xs"
				class:btn-active={activeEditor?.isActive('blockquote')}
				aria-label="Blockquote"
				data-tip="Blockquote"
				onclick={() => runCommand(() => editor?.chain().focus().toggleBlockquote().run() ?? false)}
			>
				<QuotesIcon size={iconSize} weight="bold" />
			</button>
		{/if}
		{#if canCodeBlock}
			<button
				type="button"
				class="tooltip btn btn-square btn-xs"
				class:btn-active={activeEditor?.isActive('codeBlock')}
				aria-label="Code block"
				data-tip="Code block"
				onclick={() => runCommand(() => editor?.chain().focus().toggleCodeBlock().run() ?? false)}
			>
				<CodeBlockIcon size={iconSize} weight="bold" />
			</button>
		{/if}
		{#if canHorizontalRule}
			<button
				type="button"
				class="tooltip btn btn-square btn-xs"
				aria-label="Horizontal rule"
				data-tip="Horizontal rule"
				onclick={() => runCommand(() => editor?.chain().focus().setHorizontalRule().run() ?? false)}
			>
				<MinusIcon size={iconSize} weight="bold" />
			</button>
		{/if}
	</div>
	<div bind:this={element}></div>
</div>

<style>
	:global(.uncial-richtext-editor.ProseMirror:focus) {
		outline: none;
		box-shadow: none;
	}
</style>
