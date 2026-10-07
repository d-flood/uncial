<svelte:options css="injected" />

<script lang="ts">
	import { listPages } from '../index-actions.js';
	import { SignedOutError } from '../errors.js';
	import { mediaSourceFor, type MediaItem, type MediaSource } from '../media-source.js';
	import MediaLibrary from '../svelte/MediaLibrary.svelte';
	import type { ForgeAdapter, ForgeSession, UncialCmsSiteConfig } from '../types.js';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import type { DashboardAction } from './types.js';

	interface Props {
		config: UncialCmsSiteConfig;
		adapter: ForgeAdapter;
		session: ForgeSession;
		staticDir?: string;
		basePath: string;
		mapSourceToPath?: (source: string) => string;
		branchLabel: string;
		can: (action: DashboardAction, subject?: unknown) => boolean;
		onsignedout: (reason: string) => void;
	}

	let {
		config,
		adapter,
		session,
		staticDir,
		basePath,
		mapSourceToPath,
		branchLabel,
		can,
		onsignedout
	}: Props = $props();

	const media = $derived.by((): { source: MediaSource } | { error: string } => {
		try {
			return { source: mediaSourceFor(config, { adapter, author: session.user }, { staticDir }) };
		} catch (error) {
			return { error: error instanceof Error ? error.message : String(error) };
		}
	});

	let documents: Promise<Array<{ label: string; content: string }>> | undefined;
	let checking = $state(false);
	let pending = $state<{
		item: MediaItem;
		usedBy: string[];
		resolve: (confirmed: boolean) => void;
	}>();

	const labelFor = (pagePath: string) => (pagePath === '' ? '(site root)' : `/${pagePath}/`);

	function loadDocuments(contentDir: string) {
		documents ??= listPages(adapter, contentDir, mapSourceToPath)
			.then((pages) =>
				Promise.all(
					pages.map(async (page) => ({
						label: labelFor(page.pagePath),
						content: (await adapter.readFile(page.sourcePath)).content
					}))
				)
			)
			.catch((error: unknown) => {
				documents = undefined;
				throw error;
			});
		return documents;
	}

	async function confirmDelete(item: MediaItem): Promise<boolean> {
		let usedBy: string[] = item.usage?.map((use) => use.title || use.path) ?? [];
		if (config.forge !== 'server') {
			checking = true;
			try {
				usedBy = (await loadDocuments(config.contentDir))
					.filter((document) => document.content.includes(item.url))
					.map((document) => document.label);
			} finally {
				checking = false;
			}
		}
		pending?.resolve(false);
		return new Promise((resolve) => (pending = { item, usedBy, resolve }));
	}

	function close(confirmed: boolean) {
		pending?.resolve(confirmed);
		pending = undefined;
	}
</script>

<div class="media">
	{#if 'error' in media}
		<p class="note">{media.error}</p>
	{:else}
		<MediaLibrary
			source={media.source}
			base={basePath}
			{can}
			{confirmDelete}
			onerror={(error) => {
				if (error instanceof SignedOutError) onsignedout(error.message);
			}}
		/>
	{/if}
	{#if checking}
		<p class="note" role="status">Checking which pages use it…</p>
	{/if}
</div>

{#if pending}
	{@const current = pending}
	{@const name = current.item.title || current.item.filename}
	{@const inUse = current.usedBy.length > 0}
	{#key current}
		<ConfirmDialog
			title={inUse ? 'This file is in use' : 'Delete this file?'}
			confirmLabel={inUse && config.forge !== 'server' ? 'Delete anyway' : 'Delete'}
			onclose={close}
		>
			{#if inUse}
				<p><code>{name}</code> is still used by:</p>
				<ul>
					{#each current.usedBy as label (label)}<li>{label}</li>{/each}
				</ul>
				{#if config.forge === 'server'}
					<p>Remove these uses before deleting this file.</p>
				{:else}
					<p>
						Deleting it breaks {current.usedBy.length === 1 ? 'that page' : 'those pages'}. This
						commits the deletion immediately.
					</p>
				{/if}
			{:else if config.forge === 'server'}
				<p>Delete <code>{name}</code>? This cannot be undone.</p>
			{:else}
				<p>Delete <code>{name}</code> from {branchLabel}? This commits the deletion immediately.</p>
			{/if}
		</ConfirmDialog>
	{/key}
{/if}

<style>
	p,
	ul {
		margin: 0 0 var(--uncial-space-2);
	}

	.note {
		color: var(--uncial-dashboard-muted);
	}

	.media :global(.uncial-cms-media-toolbar) {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--uncial-space-3);
		margin-bottom: var(--uncial-space-4);
	}

	.media :global(.uncial-cms-media-search) {
		flex: 1 1 14rem;
		min-width: 0;
		min-height: 2.5rem;
		padding: 0 var(--uncial-space-3);
		border: 1px solid var(--uncial-color-border-strong);
		border-radius: var(--uncial-radius-md);
		background: var(--uncial-color-surface);
		color: var(--uncial-color-text);
		font: inherit;
	}

	.media :global(.uncial-cms-media-toolbar p),
	.media :global(.uncial-cms-media-item p) {
		margin: 0;
	}

	.media :global(.uncial-cms-media-error) {
		color: var(--uncial-color-danger);
		font-weight: 600;
	}

	.media :global(.uncial-cms-media-grid) {
		margin: 0;
	}

	.media :global(.uncial-cms-media-item) {
		display: grid;
		align-content: start;
		gap: var(--uncial-space-2);
		padding: var(--uncial-space-3);
		border: 1px solid var(--uncial-color-border);
		border-radius: var(--uncial-radius-lg);
		background: var(--uncial-color-surface-elevated);
		box-shadow: var(--uncial-shadow-sm);
		font-size: 0.875rem;
	}

	.media :global(.uncial-cms-media-preview) {
		border-radius: var(--uncial-radius-md);
		background: var(--uncial-color-surface);
		color: var(--uncial-dashboard-muted);
		font-weight: 700;
		text-decoration: none;
	}

	.media :global(.uncial-cms-media-title) {
		font-weight: 600;
	}

	.media :global(.uncial-cms-media-meta) {
		color: var(--uncial-dashboard-muted);
		font-family: var(--uncial-font-mono);
		font-size: 0.75rem;
	}

	.media :global(.uncial-cms-media-delete) {
		justify-self: start;
	}
</style>
