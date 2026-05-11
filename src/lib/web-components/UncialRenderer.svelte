<script lang="ts">
	import type { JSONContent } from '@tiptap/core';
	import Renderer from '../render/Renderer.svelte';
	import type {
		BlockDefinition,
		BlockRegistry,
		ContentSchema,
		ValidationIssue
	} from '../core/types.js';
	import { emptyDocument } from '../shared/content.js';

	interface Props {
		content?: JSONContent;
		blocks?: BlockRegistry | BlockDefinition[];
		schema?: ContentSchema;
		onIssue?: (issue: ValidationIssue) => void;
	}

	let { content = emptyDocument(), blocks = [], schema = undefined, onIssue }: Props = $props();

	function dispatchIssue(issue: ValidationIssue): void {
		onIssue?.(issue);
	}
</script>

<Renderer {content} {blocks} {schema} onIssue={dispatchIssue} />
