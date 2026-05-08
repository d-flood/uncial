<script lang="ts">
	import { createRawSnippet, mount, unmount } from 'svelte';
	import type { BlockRegistry, ContentSchema } from '../core/types.js';
	import type { PMMark, PMNode } from '../shared/document.js';
	import RichContent from './RichContent.svelte';

	interface Props {
		node: PMNode;
		registry: BlockRegistry;
		schema?: ContentSchema;
	}

	let { node, registry, schema = undefined }: Props = $props();

	const block = $derived(registry.get(node.type));
	const blockAttrs = $derived((node.attrs ?? {}) as Record<string, unknown>);
	const blockContent = $derived((node.content ?? []) as PMNode[]);
	const blockChildren = $derived.by(() => {
		if (!block?.content) {
			return undefined;
		}

		return createRawSnippet(() => ({
			render: () => '<div class="uncial-render-children"></div>',
			setup: (element) => {
				const mounted = mount(RichContent, {
					target: element,
					props: {
						nodes: blockContent,
						registry,
						schema
					}
				});

				return () => {
					void unmount(mounted);
				};
			}
		}));
	});

	function getActiveMarks(marks: PMMark[] = []): PMMark[] {
		return schema ? marks.filter((mark) => schema.allowedMarks.has(mark.type)) : marks;
	}
</script>

{#snippet renderMarkedText(text: string, marks: PMMark[])}
	{#if marks.length === 0}
		{text}
	{:else}
		{@const [mark, ...rest] = marks}
		{#if mark.type === 'bold'}
			<strong>{@render renderMarkedText(text, rest)}</strong>
		{:else if mark.type === 'italic'}
			<em>{@render renderMarkedText(text, rest)}</em>
		{:else if mark.type === 'strike'}
			<s>{@render renderMarkedText(text, rest)}</s>
		{:else if mark.type === 'code'}
			<code>{@render renderMarkedText(text, rest)}</code>
		{:else}
			{@render renderMarkedText(text, rest)}
		{/if}
	{/if}
{/snippet}

{#if block && (!schema || schema.allowedBlocks.has(block.id))}
	{@const RenderComponent = block.components.render}
	<RenderComponent {...blockAttrs} content={blockContent} children={blockChildren} />
{:else if node.type === 'paragraph'}
	<p>
		<RichContent nodes={node.content ?? []} {registry} {schema} />
	</p>
{:else if node.type === 'heading'}
	{@const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)))}
	{#if level === 1}
		<h1><RichContent nodes={node.content ?? []} {registry} {schema} /></h1>
	{:else if level === 2}
		<h2><RichContent nodes={node.content ?? []} {registry} {schema} /></h2>
	{:else if level === 3}
		<h3><RichContent nodes={node.content ?? []} {registry} {schema} /></h3>
	{:else if level === 4}
		<h4><RichContent nodes={node.content ?? []} {registry} {schema} /></h4>
	{:else if level === 5}
		<h5><RichContent nodes={node.content ?? []} {registry} {schema} /></h5>
	{:else}
		<h6><RichContent nodes={node.content ?? []} {registry} {schema} /></h6>
	{/if}
{:else if node.type === 'bulletList'}
	<ul>
		<RichContent nodes={node.content ?? []} {registry} {schema} />
	</ul>
{:else if node.type === 'orderedList'}
	<ol>
		<RichContent nodes={node.content ?? []} {registry} {schema} />
	</ol>
{:else if node.type === 'listItem'}
	<li>
		<RichContent nodes={node.content ?? []} {registry} {schema} />
	</li>
{:else if node.type === 'blockquote'}
	<blockquote>
		<RichContent nodes={node.content ?? []} {registry} {schema} />
	</blockquote>
{:else if node.type === 'codeBlock'}
	<pre><code><RichContent nodes={node.content ?? []} {registry} {schema} /></code></pre>
{:else if node.type === 'horizontalRule'}
	<hr />
{:else if node.type === 'hardBreak'}
	<br />
{:else if node.type === 'text'}
	{@render renderMarkedText(node.text ?? '', getActiveMarks(node.marks ?? []))}
{/if}
