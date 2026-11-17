<script lang="ts">
	import type { JSONContent } from '@tiptap/core';
	import Editor from '../editor/Editor.svelte';
	import type { BlockAttributesController, FileSource, ImageSource } from '../editor/index.js';
	import type { ValidationIssue } from '../core/types.js';
	import type { ContentModel } from '../model.js';
	import { emptyDocument } from '../shared/content.js';

	interface Props {
		model?: ContentModel;
		json?: JSONContent;
		meta?: Record<string, unknown>;
		attributesController?: BlockAttributesController | null;
		attributesPanel?: boolean | 'docked' | 'overlay' | 'off';
		presentation?: 'card' | 'bare';
		imageSource?: ImageSource;
		fileSource?: FileSource;
		onIssue?: (issue: ValidationIssue) => void;
		onChange?: (document: JSONContent) => void;
		onMetaChange?: (meta: Record<string, unknown>) => void;
	}

	let {
		model,
		json = $bindable(emptyDocument()),
		meta = $bindable({}),
		attributesController = null,
		attributesPanel = true,
		presentation = 'card',
		imageSource,
		fileSource,
		onIssue,
		onChange,
		onMetaChange
	}: Props = $props();

	function dispatchIssue(issue: ValidationIssue): void {
		onIssue?.(issue);
	}
</script>

<!-- `Editor` reports edits itself, so the bindings here only mirror its state.
     They were get/set pairs while forwarding an edit meant intercepting the
     assignment, which could not tell an edit from a document the host loaded. -->
{#if model}
	<Editor
		{model}
		bind:json
		bind:meta
		{attributesController}
		{attributesPanel}
		{presentation}
		{imageSource}
		{fileSource}
		onIssue={dispatchIssue}
		{onChange}
		{onMetaChange}
	/>
{/if}
