<script lang="ts">
	import type { JSONContent } from '@tiptap/core';
	import Renderer from '../render/Renderer.svelte';
	import type { ValidationIssue } from '../core/types.js';
	import type { ContentModel } from '../model.js';
	import { emptyDocument } from '../shared/content.js';

	interface Props {
		model?: ContentModel;
		content?: JSONContent;
		onIssue?: (issue: ValidationIssue) => void;
	}

	let { content = emptyDocument(), model, onIssue }: Props = $props();

	function dispatchIssue(issue: ValidationIssue): void {
		onIssue?.(issue);
	}
</script>

{#if model}
	<Renderer {content} {model} onIssue={dispatchIssue} />
{/if}
