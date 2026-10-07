<svelte:options css="injected" />

<script lang="ts">
	import { onMount } from 'svelte';
	import type { ContentSchema } from 'uncial/core';
	import { AttributeFieldControl, createDocumentMetaController } from 'uncial/editor';
	import {
		describeDeployPhase,
		githubCommitUrl,
		startDeployPolling,
		type DeployPollHandle
	} from '../deploy-status.js';
	import { serializeDocument } from '../document.js';
	import type { StatusView } from '../editor-controller.js';
	import { triggerDownload } from '../editor-session.js';
	import { ConflictError, SignedOutError } from '../errors.js';
	import { globalDocument } from '../globals.js';
	import { readStoredGlobal, saveGlobal } from '../index-actions.js';
	import type { ForgeAdapter, ForgeSession, UncialCmsSiteConfig } from '../types.js';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import type { DashboardAction } from './types.js';

	interface Props {
		config: UncialCmsSiteConfig;
		adapter: ForgeAdapter;
		session: ForgeSession;
		name: string;
		schema: ContentSchema;
		branchLabel: string;
		can: (action: DashboardAction, subject?: unknown) => boolean;
		onfocusheading: () => void;
		onsignedout: (reason: string) => void;
	}

	let {
		config,
		adapter,
		session,
		name,
		schema,
		branchLabel,
		can,
		onfocusheading,
		onsignedout
	}: Props = $props();

	const uid = $props.id();
	const form = $derived(createDocumentMetaController(schema.metaFields));
	const fields = $derived(Array.from(schema.metaFields));
	const editable = $derived(can('global-edit', name));

	let sha: string | undefined;
	let poll: DeployPollHandle | undefined;
	let loaded = $state(false);
	let loadError = $state('');
	let saving = $state(false);
	let status = $state<StatusView>();
	let conflict = $state(false);
	let confirmingReload = $state(false);

	function message(error: unknown, fallback: string): string {
		if (error instanceof SignedOutError) onsignedout(error.message);
		return error instanceof Error ? error.message : fallback;
	}

	async function load() {
		try {
			const stored = await readStoredGlobal({ adapter, config }, { name, schema });
			sha = stored.sha;
			form.reset(stored.value);
			loaded = true;
			loadError = '';
		} catch (error) {
			loadError = message(error, `Failed to load ${name}.`);
		}
	}

	function validated(outcome: string): Record<string, unknown> | undefined {
		const { meta, validation } = form.commit();
		if (validation.ok) return meta;
		const count = validation.issues.filter((issue) => issue.severity === 'error').length;
		status = {
			tone: 'error',
			text: `Not ${outcome}: ${count === 1 ? '1 field needs' : `${count} fields need`} fixing.`
		};
	}

	function showDeploy(commitSha: string) {
		const commitUrl = config.forge === 'github' ? githubCommitUrl(config.repo, commitSha) : '';
		poll = startDeployPolling({
			check: () => adapter.commitStatus(commitSha),
			onPhase: (phase) => {
				const view = describeDeployPhase(phase, { branch: branchLabel, commitSha, commitUrl });
				status = { text: view.text, href: view.commitUrl, tone: view.tone };
			}
		});
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!editable || saving) return;
		const value = validated('saved');
		if (!value) return;
		poll?.cancel();
		conflict = false;
		saving = true;
		status = { tone: 'progress', text: 'Saving…' };
		try {
			const saved = await saveGlobal(
				{ adapter, config, author: { name: session.user.name, email: session.user.email } },
				{ name, schema, value, sha }
			);
			sha = saved.sha;
			if (config.forge === 'server') status = { tone: 'success', text: 'Published · live now' };
			else showDeploy(saved.commitSha);
		} catch (error) {
			if (error instanceof ConflictError) {
				conflict = true;
				status = {
					tone: 'error',
					text: `Save conflicted — ${name} changed on ${branchLabel} since you loaded it.`
				};
			} else {
				status = { tone: 'error', text: message(error, 'Save failed.') };
			}
		} finally {
			saving = false;
		}
	}

	function downloadMine() {
		const value = validated('downloaded');
		if (!value) return;
		triggerDownload({
			filename: `${name}.json`,
			content: serializeDocument(globalDocument(value), [], schema),
			mimeType: 'application/json'
		});
	}

	async function reload(confirmed: boolean) {
		confirmingReload = false;
		if (!confirmed) return;
		poll?.cancel();
		await load();
		if (loadError) return;
		conflict = false;
		status = { tone: 'success', text: `Loaded the latest ${name} from ${branchLabel}.` };
		onfocusheading();
	}

	onMount(() => {
		void load();
		return () => poll?.cancel();
	});
</script>

{#if loadError}
	<p class="error" role="alert">{loadError}</p>
{/if}

{#if conflict}
	<div class="uncial-cms-banner" role="alert">
		<p class="uncial-cms-banner-message">
			{name} changed on {branchLabel} since you loaded it. Your unsaved changes are safe — choose how
			to proceed.
		</p>
		<div class="uncial-cms-banner-actions">
			<button type="button" class="btn" onclick={downloadMine}>Download my version</button>
			<button type="button" class="btn" onclick={() => (confirmingReload = true)}>
				Reload latest
			</button>
			<button type="button" class="btn" onclick={() => (conflict = false)}>Dismiss</button>
		</div>
	</div>
{/if}

{#if loaded}
	<form class="global-form" onsubmit={save} novalidate>
		{#if !editable}
			<p id="{uid}-readonly" class="note">
				You don’t have permission to edit {name}, so it is read-only.
			</p>
		{/if}
		<fieldset disabled={!editable} aria-describedby={editable ? undefined : `${uid}-readonly`}>
			{#each fields as [field, spec] (field)}
				<AttributeFieldControl
					name={field}
					{spec}
					value={$form.draft[field]}
					error={$form.errors[field]}
					errors={$form.errors}
					onChange={(value) => form.setDraft(field, value)}
				/>
			{:else}
				<p class="note">This Global declares no fields.</p>
			{/each}
		</fieldset>
		<div class="actions">
			{#if editable}
				<button type="submit" class="btn btn-primary" disabled={saving}>Save</button>
			{/if}
			<p class="status" role="status" data-tone={status?.tone}>
				{#if status}
					{status.text}{#if status.href}&nbsp;<a href={status.href} target="_blank" rel="noopener"
							>View commit</a
						>{/if}
				{/if}
			</p>
		</div>
	</form>
{:else if !loadError}
	<p class="note">Loading…</p>
{/if}

{#if confirmingReload}
	<ConfirmDialog title="Reload the latest version?" confirmLabel="Reload latest" onclose={reload}>
		Reload {name} from {branchLabel}? This discards your unsaved changes unless you have downloaded
		them.
	</ConfirmDialog>
{/if}

<style>
	p {
		margin: 0;
	}

	.note {
		color: var(--uncial-dashboard-muted);
	}

	.error,
	.status[data-tone='error'] {
		color: var(--uncial-color-danger);
		font-weight: 600;
	}

	.uncial-cms-banner {
		display: grid;
		gap: var(--uncial-space-3);
		margin-bottom: var(--uncial-space-5);
		padding: var(--uncial-space-3) var(--uncial-space-4);
		border: 1px solid var(--uncial-color-danger);
		border-left-width: 4px;
		border-radius: var(--uncial-radius-md);
		background: var(--uncial-color-surface-elevated);
	}

	.uncial-cms-banner-actions,
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--uncial-space-2) var(--uncial-space-3);
	}

	.global-form {
		display: grid;
		gap: var(--uncial-space-4);
		max-width: 44rem;
	}

	fieldset {
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.global-form :global(.uncial-field) {
		display: grid;
		gap: var(--uncial-space-1);
		margin-bottom: var(--uncial-space-4);
	}

	.global-form :global(.uncial-field__label) {
		font-weight: 600;
	}

	.global-form :global(:is(.uncial-input, .uncial-select, .uncial-textarea)) {
		box-sizing: border-box;
		width: 100%;
		min-height: 2.5rem;
		padding: var(--uncial-space-2) var(--uncial-space-3);
		border: 1px solid var(--uncial-color-border-strong);
		border-radius: var(--uncial-radius-md);
		background: var(--uncial-color-surface);
		color: var(--uncial-color-text);
		font: inherit;
	}

	.global-form :global(.uncial-textarea) {
		min-height: 8rem;
		resize: vertical;
	}

	.global-form :global(:is(select, textarea):focus-visible) {
		outline: 2px solid var(--uncial-color-focus-ring);
		outline-offset: 2px;
	}

	.global-form :global(:is(input, select, textarea, button):disabled) {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.global-form :global(.uncial-field__error) {
		color: var(--uncial-color-danger);
		font-size: 0.875rem;
		font-weight: 600;
	}

	.global-form :global(:is(.uncial-field__warning, .uncial-help-text)) {
		margin: 0;
		color: var(--uncial-dashboard-muted);
		font-size: 0.875rem;
	}

	.global-form :global(.uncial-list-field) {
		display: grid;
		gap: var(--uncial-space-3);
	}

	.global-form :global(.uncial-list-item) {
		padding: var(--uncial-space-3);
		border: 1px solid var(--uncial-color-border);
		border-radius: var(--uncial-radius-lg);
		background: var(--uncial-color-surface-elevated);
	}

	.global-form :global(.uncial-list-item .uncial-list-item) {
		background: var(--uncial-color-surface);
	}

	.global-form :global(.uncial-list-item__head) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--uncial-space-2);
		margin-bottom: var(--uncial-space-2);
	}

	.global-form :global(.uncial-list-item > .uncial-field:last-child) {
		margin-bottom: 0;
	}

	.global-form :global(.uncial-section-label) {
		color: var(--uncial-dashboard-muted);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.global-form :global(.uncial-child-item__actions) {
		display: flex;
		gap: var(--uncial-space-1);
	}

	.global-form :global(.uncial-btn) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		min-height: 2rem;
		padding: 0 var(--uncial-space-3);
		border: 1px solid var(--uncial-color-border-strong);
		border-radius: var(--uncial-radius-md);
		background: var(--uncial-color-surface);
		color: var(--uncial-color-text);
		font: inherit;
		font-size: 0.875rem;
		font-weight: 600;
		line-height: 1;
		cursor: pointer;
	}

	.global-form :global(.uncial-btn:not(.uncial-btn--primary):hover:not(:disabled)) {
		background: var(--uncial-color-surface-elevated);
	}

	.global-form :global(.uncial-btn--start) {
		justify-self: start;
	}

	.global-form :global(.uncial-btn--square) {
		width: 2rem;
		padding: 0;
	}

	.global-form :global(.uncial-btn--ghost) {
		border-color: transparent;
		background: transparent;
	}

	.global-form :global(.uncial-btn--danger) {
		color: var(--uncial-color-danger);
	}

	.global-form :global(.uncial-btn--primary) {
		border-color: var(--uncial-color-primary);
		background: var(--uncial-color-primary);
		color: var(--uncial-color-primary-contrast);
	}
</style>
