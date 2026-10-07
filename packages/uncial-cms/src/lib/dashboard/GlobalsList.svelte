<svelte:options css="injected" />

<script lang="ts">
	import type { ContentSchema } from 'uncial/core';
	import { globalTitle } from '../globals.js';
	import { hashForRoute } from './routes.js';

	let { globals }: { globals: Record<string, ContentSchema> } = $props();

	const entries = $derived(Object.entries(globals));
</script>

{#if entries.length === 0}
	<p class="note">This site declares no Globals.</p>
{:else}
	<ul class="globals">
		{#each entries as [name, schema] (name)}
			{@const title = globalTitle(schema)}
			<li class="global">
				<a class="global-name" href={hashForRoute({ section: 'globals', name })}>{name}</a>
				{#if title}<span class="global-title">{title}</span>{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.note {
		color: var(--uncial-dashboard-muted);
	}

	.globals {
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--uncial-color-border);
		border-radius: var(--uncial-radius-lg);
	}

	.global {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--uncial-space-1) var(--uncial-space-3);
		padding: var(--uncial-space-3) var(--uncial-space-4);
	}

	.global + .global {
		border-top: 1px solid var(--uncial-color-border);
	}

	.global-name {
		color: var(--uncial-color-primary);
		font-family: var(--uncial-font-mono);
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.global-title {
		color: var(--uncial-dashboard-muted);
	}
</style>
