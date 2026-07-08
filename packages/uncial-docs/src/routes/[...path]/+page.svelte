<script lang="ts">
	// Production docs page: renders via uncial's SSR entries only. It must ship
	// zero uncial-cms JavaScript (asserted by assert:clean-pages in a later slice)
	// — do not import mountEditorPage / the uncial-cms runtime here.
	import { base } from '$app/paths';
	import { Renderer } from 'uncial/render';
	import { buildDocsToc, type TocEntry } from '$lib/toc.js';
	import { blocks, schema } from '../site.js';

	let { data } = $props();
	const title = $derived(String(data.meta.title ?? 'Untitled page'));
	const toc = $derived(buildDocsToc(data.document));

	const href = (path: string): string => `${base}/${path}${path === '' ? '' : '/'}`;

	// The SSR renderer emits headings without ids, so assign the TOC's slug ids to
	// the rendered heading elements on hydration (index-aligned: `toc` and these
	// headings both derive from the same document, in document order). Reader pages
	// still ship no editor JS — this is ordinary page hydration.
	function assignHeadingIds(node: HTMLElement, entries: TocEntry[]) {
		const apply = (items: TocEntry[]): void => {
			const headings = node.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6');
			items.forEach((entry, index) => {
				const heading = headings[index];
				if (heading && !heading.id) heading.id = entry.id;
			});
		};
		apply(entries);
		return { update: apply };
	}
</script>

<svelte:head>
	<title>{title} · Uncial Docs</title>
</svelte:head>

<div class="mx-auto flex max-w-368 flex-col gap-10 px-6 py-10 sm:px-10 lg:flex-row">
	<aside class="lg:w-60 lg:shrink-0">
		<nav aria-label="Docs navigation" class="lg:sticky lg:top-6">
			{#each data.nav as group (group.group)}
				<p class="mt-4 mb-1 text-xs font-bold uppercase tracking-wide opacity-60 first:mt-0">
					{group.group}
				</p>
				<ul class="menu menu-sm w-full p-0">
					{#each group.items as item (item.path)}
						<li>
							<a href={href(item.path)} class:menu-active={item.path === data.path}>
								{item.title}
							</a>
						</li>
					{/each}
				</ul>
			{/each}
		</nav>
	</aside>

	<main class="min-w-0 flex-1">
		<article class="uncial-rich-content space-y-6">
			<h1 class="font-vellum-display text-4xl font-bold">{title}</h1>
			{#if toc.length > 0}
				<nav aria-label="On this page" class="rounded-box border border-base-content/15 p-4">
					<p class="mb-2 text-xs font-bold uppercase tracking-wide opacity-60">On this page</p>
					<ul class="space-y-1">
						{#each toc as entry (entry.id)}
							<li style="padding-inline-start: {(Math.max(2, entry.level) - 2) * 0.75}rem">
								<a href="#{entry.id}" class="link link-hover text-sm">{entry.text}</a>
							</li>
						{/each}
					</ul>
				</nav>
			{/if}
			<div use:assignHeadingIds={toc}>
				<Renderer content={data.document} {blocks} {schema} />
			</div>
		</article>
	</main>
</div>
