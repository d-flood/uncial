<script lang="ts">
	// Editor variant: the same sidebar, <main> and <article> shell the Content
	// page draws, with EditorPage where the Renderer sits. That is the whole of
	// the parity work — the editor's content box is the article's box because it
	// is inside the article, in the site's own cascade.
	import { base } from '$app/paths';
	import { EditorPage } from 'uncial-cms/svelte';
	import { blocks, schema, site } from '../../site.js';

	let { data } = $props();

	const href = (path: string): string => `${base}/${path}${path === '' ? '' : '/'}`;
</script>

<svelte:head>
	<title>Edit {data.pagePath === '' ? 'home' : data.pagePath} · Uncial Docs</title>
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
							<a href={href(item.path)} class:menu-active={item.path === data.pagePath}>
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
			<EditorPage
				{site}
				{blocks}
				{schema}
				sourcePath={data.sourcePath}
				pagePath={data.pagePath}
			/>
		</article>
	</main>
</div>
