<svelte:options css="injected" />

<script lang="ts">
	import { onMount } from 'svelte';
	import {
		deleteCollectionRecord,
		listCollectionRecords,
		readCollectionRecord
	} from '../collections.js';
	import type { CollectionDeclaration } from '../define-site.js';
	import { SignedOutError } from '../errors.js';
	import { validatePagePath } from '../paths/index.js';
	import type { ForgeAdapter, UncialCmsSiteConfig } from '../types.js';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { hashForRoute } from './routes.js';
	import type { DashboardAction } from './types.js';

	interface Props {
		config: UncialCmsSiteConfig;
		adapter: ForgeAdapter;
		collection: CollectionDeclaration & { name: string };
		branchLabel: string;
		can: (action: DashboardAction, subject?: unknown) => boolean;
		onfocusheading: () => void;
		onsignedout: (reason: string) => void;
	}

	let { config, adapter, collection, branchLabel, can, onfocusheading, onsignedout }: Props =
		$props();

	const uid = $props.id();
	const deps = $derived({ adapter, config });
	const subject = (slug: string) => `${collection.name}/${slug}`;
	// The server forge publishes a record as it saves it.
	const mayCreate = (record?: string) =>
		can('create', record) && (config.forge !== 'server' || can('publish', record));

	let records = $state<Array<{ slug: string; summary?: string }>>();
	let listError = $state('');
	let slug = $state('');
	let createError = $state('');
	let creating = $state(false);
	let pendingDelete = $state<string>();

	function message(error: unknown, fallback: string): string {
		if (error instanceof SignedOutError) onsignedout(error.message);
		return error instanceof Error ? error.message : fallback;
	}

	async function refresh() {
		try {
			records = await listCollectionRecords(deps, collection);
			listError = '';
		} catch (error) {
			listError = message(error, 'Failed to list records.');
		}
	}

	async function create(event: SubmitEvent) {
		event.preventDefault();
		const result = validatePagePath(slug);
		if (!result.ok) {
			createError = 'Enter a slug of lowercase letters, digits and hyphens, e.g. new-york.';
			return;
		}
		if (!mayCreate(subject(result.path))) {
			createError = `You don’t have permission to create ${subject(result.path)}.`;
			return;
		}
		createError = '';
		creating = true;
		try {
			const existing = await readCollectionRecord(deps, collection, result.path);
			if (existing.sha !== undefined) {
				createError = `${collection.name} already has a record "${result.path}".`;
				return;
			}
			location.hash = hashForRoute({
				section: 'collections',
				name: collection.name,
				slug: result.path
			});
		} catch (error) {
			createError = message(error, 'Create failed.');
		} finally {
			creating = false;
		}
	}

	async function finishDelete(confirmed: boolean) {
		const target = pendingDelete;
		pendingDelete = undefined;
		if (!confirmed || target === undefined) return;
		try {
			await deleteCollectionRecord(deps, collection, target);
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

{#if mayCreate()}
	<form class="create" onsubmit={create} novalidate>
		<label for="{uid}-slug">New record slug</label>
		<div class="create-row">
			<input
				id="{uid}-slug"
				name="slug"
				autocomplete="off"
				spellcheck="false"
				bind:value={slug}
				aria-invalid={createError ? 'true' : undefined}
				aria-describedby={createError ? `${uid}-error` : undefined}
			/>
			<button type="submit" class="btn btn-primary" disabled={creating}>Create record</button>
		</div>
		{#if createError}
			<p id="{uid}-error" class="error" role="alert">{createError}</p>
		{/if}
	</form>
{/if}

{#if listError}
	<p class="error" role="alert">{listError}</p>
{/if}

{#if records === undefined}
	{#if !listError}<p class="note">Loading records…</p>{/if}
{:else if records.length === 0}
	<p class="note">No records yet.</p>
{:else}
	<ul class="records">
		{#each records as record (record.slug)}
			<li class="record">
				<div class="record-main">
					<a
						class="record-slug"
						href={hashForRoute({
							section: 'collections',
							name: collection.name,
							slug: record.slug
						})}>{record.slug}</a
					>
					{#if record.summary}<span class="record-summary">{record.summary}</span>{/if}
				</div>
				{#if can('delete', subject(record.slug))}
					<button
						type="button"
						class="btn btn-danger"
						onclick={() => (pendingDelete = record.slug)}
					>
						Delete<span class="visually-hidden"> {record.slug}</span>
					</button>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

{#if pendingDelete !== undefined}
	<ConfirmDialog title="Delete this record?" confirmLabel="Delete" onclose={finishDelete}>
		Delete <code>{subject(pendingDelete)}</code> from {branchLabel}?
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

	input {
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

	.records {
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--uncial-color-border);
		border-radius: var(--uncial-radius-lg);
	}

	.record {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--uncial-space-2) var(--uncial-space-3);
		padding: var(--uncial-space-3) var(--uncial-space-4);
	}

	.record + .record {
		border-top: 1px solid var(--uncial-color-border);
	}

	.record-main {
		display: flex;
		flex: 1 1 12rem;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--uncial-space-1) var(--uncial-space-3);
		min-width: 0;
	}

	.record-slug {
		color: var(--uncial-color-primary);
		font-family: var(--uncial-font-mono);
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.record-summary {
		color: var(--uncial-dashboard-muted);
		overflow-wrap: anywhere;
	}
</style>
