<script lang="ts">
	import type { Component } from 'svelte';
	import type { BlockRegistry, ContentSchema } from '../core/types.js';
	import type { PMMark, PMNode } from '../shared/document.js';
	import { getCodeLanguageClass, highlightCodeToHtml } from '../shared/syntaxHighlight.js';
	import RichContent from './RichContent.svelte';
	import { resolveLinkRel, sanitizeHref } from './sanitize.js';

	interface Props {
		node: PMNode;
		registry: BlockRegistry;
		schema?: ContentSchema;
	}

	let { node, registry, schema = undefined }: Props = $props();

	const block = $derived(registry.get(node.type));
	const blockAttrs = $derived((node.attrs ?? {}) as Record<string, unknown>);
	const blockContent = $derived((node.content ?? []) as PMNode[]);
	const codeLanguage = $derived(node.attrs?.language);
	const codeText = $derived.by(() =>
		(node.content ?? [])
			.filter((child) => child.type === 'text')
			.map((child) => child.text ?? '')
			.join('')
	);
	const highlightedCode = $derived(highlightCodeToHtml(codeText, codeLanguage));

	function getActiveMarks(marks: PMMark[] = []): PMMark[] {
		return schema ? marks.filter((mark) => schema.allowedMarks.has(mark.type)) : marks;
	}

	function getSvelteRenderComponent(component: unknown): Component<Record<string, unknown>> {
		return component as Component<Record<string, unknown>>;
	}

	function getLinkAttrs(attrs: Record<string, unknown> | undefined): Record<string, string> {
		const result: Record<string, string> = {};
		if (attrs) {
			if (typeof attrs.title === 'string' && attrs.title) result.title = attrs.title;
			if (typeof attrs.class === 'string' && attrs.class) result.class = attrs.class;
			const target =
				typeof attrs.target === 'string' && attrs.target.trim() ? attrs.target.trim() : undefined;
			if (target) result.target = target;
			const rel = resolveLinkRel(attrs.rel, target);
			if (rel) result.rel = rel;
		}
		return result;
	}
</script>

{#snippet blockChildren()}
	<RichContent nodes={blockContent} {registry} {schema} />
{/snippet}

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
		{:else if mark.type === 'link'}
			{@const href = sanitizeHref(mark.attrs?.href)}
			{#if href}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- sanitized rich-text links may be external, app-relative, mailto, tel, or hash URLs -->
				<a {href} {...getLinkAttrs(mark.attrs)}>{@render renderMarkedText(text, rest)}</a>
			{:else}
				{@render renderMarkedText(text, rest)}
			{/if}
		{:else}
			{@render renderMarkedText(text, rest)}
		{/if}
	{/if}
{/snippet}

{#if node.type === 'codeBlock'}
	<!-- eslint-disable svelte/no-at-html-tags -- highlighted code is escaped in syntaxHighlight.ts -->
	<pre class="uncial-code-block"><code class={getCodeLanguageClass(codeLanguage)}
			>{@html highlightedCode}</code
		></pre>
	<!-- eslint-enable svelte/no-at-html-tags -->
{:else if block && (!schema || schema.allowedBlocks.has(block.id))}
	{@const RenderComponent = getSvelteRenderComponent(block.components.render.component)}
	<RenderComponent
		{...blockAttrs}
		{...(block as unknown as { renderProps?: Record<string, unknown> }).renderProps ?? {}}
		content={blockContent}
		children={block.content ? blockChildren : undefined}
	/>
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
	{@render renderMarkedText(node.text ?? '', getActiveMarks(node.marks ?? []))}
{/if}
