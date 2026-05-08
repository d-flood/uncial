<script lang="ts">
	import type { JSONContent } from '@tiptap/core';
	import { normalizeDocument } from '../core/normalize.js';
	import { validateDocument } from '../core/validate.js';
	import type {
		BlockDefinition,
		BlockRegistry,
		ContentSchema,
		ValidationIssue
	} from '../core/types.js';
	import type { PMDoc, PMNode } from '../shared/document.js';
	import { resolveRegistry } from '../core/registry.js';
	import { emptyDocument } from '../shared/content.js';
	import RichContent from './RichContent.svelte';

	interface Props {
		content?: JSONContent;
		blocks?: BlockRegistry | BlockDefinition[];
		schema?: ContentSchema;
		onIssue?: (issue: ValidationIssue) => void;
	}

	let { content = emptyDocument(), blocks = [], schema = undefined, onIssue }: Props = $props();

	const registry = $derived(resolveRegistry(blocks));
	const normalizedContent = $derived(
		normalizeDocument(content as Partial<PMDoc>, registry, schema)
	);

	$effect(() => {
		if (!schema) return;
		validateDocument(normalizedContent, registry, schema, { onIssue });
	});
</script>

<div class="uncial-renderer rounded-box border border-base-300 bg-base-100 shadow-sm">
	<div class="uncial-content uncial-rich-content min-h-[28rem] p-5 leading-7 sm:p-8">
		<RichContent nodes={(normalizedContent.content ?? []) as PMNode[]} {registry} {schema} />
	</div>
</div>
