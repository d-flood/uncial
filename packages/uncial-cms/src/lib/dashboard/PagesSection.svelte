<svelte:options css="injected" />

<script lang="ts">
	import { onMount } from 'svelte';
	import { SignedOutError } from '../errors.js';
	import { createPage, deletePage, listPages } from '../index-actions.js';
	import { validatePagePath } from '../paths/index.js';
	import type { ServerForgeAdapter } from '../server-forge/adapter.js';
	import { describeContentStatus } from '../server-forge/protocol.js';
	import type { ForgeAdapter, ForgeSession, UncialCmsSiteConfig } from '../types.js';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import {
		filterPages,
		folderOptions,
		kindOptions,
		pageWindow,
		type ListedPage
	} from './pages-list.js';
	import { hashForRoute, type PagesQuery } from './routes.js';
	import type { DashboardAction } from './types.js';

	interface Props {
		config: UncialCmsSiteConfig;
		adapter: ForgeAdapter;
		session: ForgeSession;
		blocks: unknown;
		schemaFor: (pagePath: string) => unknown;
		sourceFor: (pagePath: string) => string;
		mapSourceToPath?: (source: string) => string;
		basePath: string;
		editorHref?: (pagePath: string) => string;
		branchLabel: string;
		can: (action: DashboardAction, subject?: unknown) => boolean;
		query: PagesQuery;
		onquery: (query: PagesQuery) => void;
		onfocusheading: () => void;
		onsignedout: (reason: string) => void;
	}

	let {
		config,
		adapter,
		session,
		blocks,
		schemaFor,
		sourceFor,
		mapSourceToPath,
		basePath,
		editorHref,
		branchLabel,
		can,
		query,
		onquery,
		onfocusheading,
		onsignedout
	}: Props = $props();

	const uid = $props.id();

	let pages = $state<ListedPage[]>();
	let listError = $state('');
	let path = $state('');
	let createError = $state('');
	let creating = $state(false);
	let pendingDelete = $state<ListedPage>();

	const server = $derived(config.forge === 'server');
	const kinds = $derived(server ? kindOptions(pages ?? []) : []);
	const folders = $derived(server ? [] : folderOptions(pages ?? []));
	const known = (value: string | undefined, options: string[]) =>
		value && options.includes(value) ? value : undefined;
	const filters = $derived<PagesQuery>({
		q: query.q,
		kind: known(query.kind, kinds),
		folder: known(query.folder, folders),
		status: server ? query.status : undefined
	});
	const matches = $derived(filterPages(pages ?? [], filters));
	const view = $derived(pageWindow(matches.length, query.page));

	const filter = (next: PagesQuery) => onquery({ ...filters, ...next, page: undefined });
	const turnTo = (page: number) => {
		if (page >= 1 && page <= view.pageCount) onquery({ ...filters, page });
	};

	function message(error: unknown, fallback: string): string {
		if (error instanceof SignedOutError) onsignedout(error.message);
		return error instanceof Error ? error.message : fallback;
	}
	const labelFor = (page: ListedPage) =>
		page.pagePath === '' ? '(site root)' : `/${page.pagePath}/`;
	const liveUrl = (pagePath: string) => `${basePath}/${pagePath === '' ? '' : `${pagePath}/`}`;
	const editUrl = (pagePath: string) =>
		editorHref?.(pagePath) || hashForRoute({ section: 'edit', pagePath });

	async function refresh() {
		try {
			pages =
				config.forge === 'server'
					? (await (adapter as ServerForgeAdapter).list()).map((record) => ({
							pagePath: mapSourceToPath?.(record.path) ?? record.path.replace(/^\/+|\/+$/g, ''),
							sourcePath: record.path,
							title: record.title,
							kind: record.kind,
							status: record.status
						}))
					: await Promise.all(
							(await listPages(adapter, config.contentDir, mapSourceToPath)).map(async (page) => {
								const { content } = await adapter.readFile(page.sourcePath);
								const { meta } = JSON.parse(content) as { meta?: { title?: unknown } };
								return { ...page, title: typeof meta?.title === 'string' ? meta.title : undefined };
							})
						);
			listError = '';
		} catch (error) {
			listError = message(error, 'Failed to list pages.');
		}
	}

	async function create(event: SubmitEvent) {
		event.preventDefault();
		const result = validatePagePath(path);
		if (!result.ok) {
			createError = result.message;
			return;
		}
		if (!can('create', result.path)) {
			createError = `You don’t have permission to create /${result.path}/.`;
			return;
		}
		createError = '';
		creating = true;
		try {
			await createPage(
				{ adapter, blocks, schema: schemaFor(result.path), author: session.user },
				{ pagePath: result.path, sourcePath: sourceFor(result.path) }
			);
			location.hash = hashForRoute({ section: 'edit', pagePath: result.path });
		} catch (error) {
			createError = message(error, 'Create failed.');
		} finally {
			creating = false;
		}
	}

	async function finishDelete(confirmed: boolean) {
		const page = pendingDelete;
		pendingDelete = undefined;
		if (!confirmed || !page) return;
		try {
			await deletePage(adapter, page);
			await refresh();
			onfocusheading();
		} catch (error) {
			listError = message(error, 'Delete failed.');
		}
	}

	onMount(() => {
		void refresh();
	});
</script>

{#if can('create')}
	<form class="create" onsubmit={create} novalidate>
		<label for="{uid}-path">New page path</label>
		<div class="create-row">
			<input
				id="{uid}-path"
				name="path"
				placeholder="team/new-page"
				autocomplete="off"
				spellcheck="false"
				bind:value={path}
				aria-invalid={createError ? 'true' : undefined}
				aria-describedby={createError ? `${uid}-error` : undefined}
			/>
			<button type="submit" class="btn btn-primary" disabled={creating}>Create page</button>
		</div>
		{#if createError}
			<p id="{uid}-error" class="error" role="alert">{createError}</p>
		{/if}
	</form>
{/if}

{#if listError}
	<p class="error" role="alert">{listError}</p>
{/if}

{#if pages === undefined}
	{#if !listError}<p class="note">Loading pages…</p>{/if}
{:else if pages.length === 0}
	<p class="note">No pages yet.</p>
{:else}
	<div class="filters" role="search" aria-label="Filter pages">
		<div class="field search">
			<label for="{uid}-q">Search</label>
			<input
				id="{uid}-q"
				type="search"
				placeholder="Title or path"
				autocomplete="off"
				spellcheck="false"
				value={query.q ?? ''}
				oninput={(event) => filter({ q: event.currentTarget.value })}
			/>
		</div>
		{#if kinds.length > 0}
			<div class="field">
				<label for="{uid}-kind">Type</label>
				<select
					id="{uid}-kind"
					value={filters.kind ?? ''}
					onchange={(event) => filter({ kind: event.currentTarget.value || undefined })}
				>
					<option value="">All types</option>
					{#each kinds as kind (kind)}<option value={kind}>{kind}</option>{/each}
				</select>
			</div>
		{/if}
		{#if folders.length > 0}
			<div class="field">
				<label for="{uid}-folder">Folder</label>
				<select
					id="{uid}-folder"
					value={filters.folder ?? ''}
					onchange={(event) => filter({ folder: event.currentTarget.value || undefined })}
				>
					<option value="">All folders</option>
					{#each folders as folder (folder)}<option value={folder}>/{folder}/</option>{/each}
				</select>
			</div>
		{/if}
		{#if server}
			<div class="field">
				<label for="{uid}-status">Status</label>
				<select
					id="{uid}-status"
					value={filters.status ?? ''}
					onchange={(event) =>
						filter({ status: (event.currentTarget.value || undefined) as PagesQuery['status'] })}
				>
					<option value="">Any status</option>
					<option value="draft">Draft</option>
					<option value="published">Published</option>
				</select>
			</div>
		{/if}
	</div>

	<p class="note" aria-live="polite">
		{#if matches.length === 0}
			No pages match.
		{:else}
			Showing {view.start + 1}–{view.end} of {matches.length}
			{matches.length === 1 ? 'page' : 'pages'}
		{/if}
	</p>

	{#if matches.length > 0}
		<ul class="pages">
			{#each matches.slice(view.start, view.end) as page (page.sourcePath)}
				{@const label = labelFor(page)}
				<li class="page">
					<div class="page-main">
						<span class="page-path">{label}</span>
						{#if page.status}<span class="badge">{describeContentStatus(page.status)}</span>{/if}
						{#if page.title}<span class="page-title">{page.title}</span>{/if}
						<span class="page-source">{page.sourcePath}</span>
					</div>
					<div class="page-actions">
						<a class="btn btn-primary" href={editUrl(page.pagePath)}>
							Edit<span class="visually-hidden"> {label}</span>
						</a>
						<a class="btn" href={liveUrl(page.pagePath)}>
							View<span class="visually-hidden"> {label}</span>
						</a>
						{#if can('delete', page.pagePath)}
							<button type="button" class="btn btn-danger" onclick={() => (pendingDelete = page)}>
								Delete<span class="visually-hidden"> {label}</span>
							</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#if view.pageCount > 1}
		<nav class="pager" aria-label="Pagination">
			<button
				type="button"
				class="btn"
				aria-disabled={view.page === 1}
				onclick={() => turnTo(view.page - 1)}>Previous page</button
			>
			<span>Page {view.page} of {view.pageCount}</span>
			<button
				type="button"
				class="btn"
				aria-disabled={view.page === view.pageCount}
				onclick={() => turnTo(view.page + 1)}>Next page</button
			>
		</nav>
	{/if}
{/if}

{#if pendingDelete}
	<ConfirmDialog title="Delete this page?" confirmLabel="Delete" onclose={finishDelete}>
		Delete <code>{pendingDelete.sourcePath}</code> from {branchLabel}?
		{config.forge === 'server'
			? 'This cannot be undone.'
			: 'This commits the deletion immediately.'}
	</ConfirmDialog>
{/if}

<style>
	.create {
		display: grid;
		gap: var(--uncial-space-2);
		margin-bottom: var(--uncial-space-6);
	}

	label {
		font-weight: 600;
	}

	.create-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--uncial-space-2);
	}

	input,
	select {
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

	select {
		padding-right: var(--uncial-space-2);
	}

	input[aria-invalid='true'] {
		border-color: var(--uncial-color-danger);
	}

	.error {
		margin: 0;
		color: var(--uncial-color-danger);
		font-weight: 600;
	}

	.note {
		color: var(--uncial-dashboard-muted);
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--uncial-space-3);
	}

	.field {
		display: grid;
		flex: 1 1 10rem;
		gap: var(--uncial-space-1);
	}

	.field.search {
		flex: 3 1 16rem;
	}

	.pager {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: var(--uncial-space-3);
		margin-top: var(--uncial-space-4);
	}

	.pager .btn[aria-disabled='true'] {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.pages {
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--uncial-color-border);
		border-radius: var(--uncial-radius-lg);
	}

	.page {
		display: flex;
		align-items: center;
		gap: var(--uncial-space-3);
		padding: var(--uncial-space-3) var(--uncial-space-4);
	}

	.page + .page {
		border-top: 1px solid var(--uncial-color-border);
	}

	.page-main {
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--uncial-space-1) var(--uncial-space-2);
		min-width: 0;
	}

	.page-path {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.page-title {
		flex-basis: 100%;
	}

	.page-source {
		flex-basis: 100%;
		color: var(--uncial-dashboard-muted);
		font-family: var(--uncial-font-mono);
		font-size: 0.75rem;
		overflow-wrap: anywhere;
	}

	.badge {
		padding: 0 var(--uncial-space-2);
		border: 1px solid var(--uncial-color-border-strong);
		border-radius: 999px;
		font-size: 0.75rem;
	}

	.page-actions {
		display: flex;
		flex-shrink: 0;
		gap: var(--uncial-space-2);
	}

	@media (max-width: 40rem) {
		.pages {
			display: grid;
			gap: var(--uncial-space-3);
			border: 0;
		}

		.page {
			flex-direction: column;
			align-items: stretch;
			border: 1px solid var(--uncial-color-border);
			border-radius: var(--uncial-radius-lg);
			background: var(--uncial-color-surface-elevated);
			box-shadow: var(--uncial-shadow-sm);
		}

		.page + .page {
			border-top: 1px solid var(--uncial-color-border);
		}

		.page-actions .btn {
			flex: 1;
		}
	}
</style>
