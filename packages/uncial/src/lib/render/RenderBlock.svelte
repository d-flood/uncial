<script lang="ts">
	import { getContext, type Component } from 'svelte';
	import type { BlockContext, BlockPage } from '../core/runtime.js';
	import type {
		BlockDefinition,
		BlockRegistry,
		ContentSchema,
		MarkRegistry
	} from '../core/types.js';
	import type { PMNode } from '../shared/document.js';
	import {
		BLOCK_CONTEXT,
		PAGE_CONTEXT,
		blockAttrs,
		blockSummary,
		emptyPage,
		setBlockContext
	} from '../runtime/blockContext.js';
	import { getFieldHost } from '../runtime/fields.js';
	import { withBase } from '../shared/mediaValues.js';
	import RichContent from './RichContent.svelte';

	interface Props {
		node: PMNode;
		block: BlockDefinition;
		index: number;
		siblings: PMNode[];
		registry: BlockRegistry;
		markRegistry?: MarkRegistry;
		schema?: ContentSchema;
	}

	let props: Props = $props();

	const enclosing = getContext<BlockContext | undefined>(BLOCK_CONTEXT);
	const page = getContext<{ readonly page: BlockPage } | undefined>(PAGE_CONTEXT);
	const host = getFieldHost();
	const nodeAttrs = $derived(
		withBase(
			props.block.attributes,
			(props.node.attrs ?? {}) as Record<string, unknown>,
			host?.base ?? ''
		)
	);
	const attrs = $derived(blockAttrs(props.registry, props.node.type, nodeAttrs));
	const siblings = $derived(props.siblings.map((node) => blockSummary(props.registry, node)));
	const content = $derived((props.node.content ?? []) as PMNode[]);
	const RenderComponent = $derived(
		props.block.components.render.component as Component<Record<string, unknown>>
	);

	setBlockContext({
		get id() {
			return typeof nodeAttrs.id === 'string' ? nodeAttrs.id : '';
		},
		get type() {
			return props.node.type;
		},
		get attrs() {
			return attrs;
		},
		editing: false,
		update() {},
		get parent() {
			return enclosing ? { type: enclosing.type, attrs: enclosing.attrs } : null;
		},
		get index() {
			return props.index;
		},
		get siblings() {
			return siblings;
		},
		get page() {
			return page?.page ?? emptyPage();
		},
		media: null
	});
</script>

{#snippet children()}
	<RichContent
		nodes={content}
		registry={props.registry}
		markRegistry={props.markRegistry}
		schema={props.schema}
	/>
{/snippet}

<RenderComponent
	{...nodeAttrs}
	{...(props.block as unknown as { renderProps?: Record<string, unknown> }).renderProps ?? {}}
	{content}
	children={props.block.content ? children : undefined}
/>
