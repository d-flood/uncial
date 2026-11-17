<script lang="ts">
	import type { JSONContent } from '@tiptap/core';
	import { setContext } from 'svelte';
	import { normalizeDocument } from '../core/normalize.js';
	import { validateDocument } from '../core/validate.js';
	import type { ValidationIssue } from '../core/types.js';
	import type { PMDoc, PMNode } from '../shared/document.js';
	import { resolveMarkRegistry } from '../core/registry.js';
	import { emptyDocument } from '../shared/content.js';
	import { SVELTE_RUNTIME_ID } from '../shared/runtimeId.js';
	import RichContent from './RichContent.svelte';
	import type { ContentModel } from '../model.js';
	import { BLOCK_CONTEXT, PAGE_CONTEXT } from '../runtime/blockContext.js';
	import { metaScope, setFieldHost } from '../runtime/fields.js';
	import { withBase } from '../shared/mediaValues.js';

	interface Props {
		content?: JSONContent;
		model: ContentModel;
		/** The page path Blocks read from their Block context. */
		path?: string;
		onIssue?: (issue: ValidationIssue) => void;
	}

	let { content = emptyDocument(), model, path = '', onIssue }: Props = $props();

	const schema = $derived(model.schemaFor((content as Partial<PMDoc>).meta));
	const registry = $derived.by(() => {
		const runtime = model.blocks.blocks[0]?.runtime;
		if (runtime && runtime !== SVELTE_RUNTIME_ID) {
			throw new Error(`The Svelte renderer cannot render "${runtime}" runtime blocks`);
		}
		return model.blocks;
	});
	const markRegistry = $derived(resolveMarkRegistry(model.marks));
	const normalizedContent = $derived(
		normalizeDocument(content as Partial<PMDoc>, registry, schema)
	);

	setContext(BLOCK_CONTEXT, undefined);
	const base = () => model.base;
	const page = $derived.by(() => {
		const stored = normalizedContent.meta ?? {};
		const meta = withBase(schema.metaFields, stored, base());
		return { path, template: model.templateFor(stored)?.id ?? '', meta };
	});
	setContext(PAGE_CONTEXT, {
		get page() {
			return page;
		}
	});

	setFieldHost({
		get base() {
			return base();
		},
		get registry() {
			return registry;
		},
		get renditions() {
			return model.renditions;
		},
		page: metaScope({
			base,
			values: () => page.meta,
			specs: () => schema.metaFields
		})
	});

	$effect(() => {
		validateDocument(normalizedContent, registry, schema, { onIssue });
	});
</script>

<div class="uncial-renderer">
	<div class="uncial-content uncial-rich-content">
		<RichContent
			nodes={(normalizedContent.content ?? []) as PMNode[]}
			{registry}
			{markRegistry}
			{schema}
		/>
	</div>
</div>
