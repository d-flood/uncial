<script module lang="ts">
	import { defineTemplate } from 'uncial';

	export const template = defineTemplate({ id: 'docs', label: 'Docs page' });
</script>

<script lang="ts">
	import { base } from '$app/paths';
	import { Text, type TemplateProps } from 'uncial';
	import type { NavEntry } from 'uncial-cms';
	import type { TocEntry } from '$lib/toc.js';

	let {
		path,
		data,
		body
	}: TemplateProps<typeof template, { nav: NavEntry[]; toc: TocEntry[] }> = $props();

	const trim = (href: string): string => href.replace(/\/+$/, '');
	const current = $derived(trim(`${base}/${path}`));
</script>

<div class="mx-auto flex max-w-368 flex-col gap-10 px-6 py-10 sm:px-10 lg:flex-row">
	<aside class="lg:w-60 lg:shrink-0">
		<nav aria-label="Docs navigation" class="lg:sticky lg:top-6">
			{#each data.nav as entry (entry.kind === 'group' ? entry.id : entry.href)}
				{#if entry.kind === 'group'}
					<p class="mt-4 mb-1 text-xs font-bold uppercase tracking-wide opacity-60 first:mt-0">
						{entry.label}
					</p>
					<ul class="menu menu-sm w-full p-0">
						{#each entry.links as link (link.href)}
							<li>
								<a href={link.href} class:menu-active={trim(link.href) === current}>
									{link.label}
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<ul class="menu menu-sm w-full p-0">
						<li>
							<a href={entry.href} class:menu-active={trim(entry.href) === current}>
								{entry.label}
							</a>
						</li>
					</ul>
				{/if}
			{/each}
		</nav>
	</aside>

	<main class="min-w-0 flex-1">
		<article class="uncial-rich-content space-y-6">
			<h1 class="font-vellum-display text-4xl font-bold"><Text name="title" /></h1>
			{#if data.toc.length > 0}
				<nav aria-label="On this page" class="rounded-box border border-base-content/15 p-4">
					<p class="mb-2 text-xs font-bold uppercase tracking-wide opacity-60">On this page</p>
					<ul class="space-y-1">
						{#each data.toc as entry, index (index)}
							<li style="padding-inline-start: {(Math.max(2, entry.level) - 2) * 0.75}rem">
								<a href="#{entry.id}" class="link link-hover text-sm">{entry.text}</a>
							</li>
						{/each}
					</ul>
				</nav>
			{/if}
			{@render body()}
		</article>
	</main>
</div>
