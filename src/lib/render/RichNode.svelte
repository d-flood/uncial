<script lang="ts">
	import type { BlockRegistry, ContentSchema } from '../core/types.js';
	import type { PMMark, PMNode } from '../shared/document.js';
	import RichContent from './RichContent.svelte';

	export let node: PMNode;
	export let registry: BlockRegistry;
	export let schema: ContentSchema | undefined = undefined;

	$: block = registry.get(node.type);
	$: blockAttrs = (node.attrs ?? {}) as Record<string, unknown>;

	function escapeHtml(value: string): string {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;');
	}

	function renderText(text: string, marks: PMMark[] = []): string {
		let result = escapeHtml(text);
		const activeMarks = schema
			? marks.filter((mark) => schema.allowedMarks.has(mark.type))
			: marks;

		for (const mark of activeMarks) {
			if (mark.type === 'bold') {
				result = `<strong>${result}</strong>`;
				continue;
			}
			if (mark.type === 'italic') {
				result = `<em>${result}</em>`;
				continue;
			}
			if (mark.type === 'link') {
				const href = escapeHtml(String(mark.attrs?.href ?? ''));
				result = `<a href="${href}">${result}</a>`;
			}
		}

		return result;
	}
</script>

{#if block && (!schema || schema.allowedBlocks.has(block.id))}
	<svelte:component this={block.components.render} {...blockAttrs} />
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
{:else if node.type === 'horizontalRule'}
	<hr />
{:else if node.type === 'hardBreak'}
	<br />
{:else if node.type === 'text'}
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html renderText(node.text ?? '', node.marks ?? [])}
{/if}
