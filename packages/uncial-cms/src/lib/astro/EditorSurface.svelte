<script lang="ts">
	/**
	 * An Astro editor route's island: Uncial's `Editor` in the host's own tree
	 * and cascade, driven by the headless editor session, with the status line,
	 * conflict banner and Save or autosave around it.
	 *
	 * The Site object is not a serializable island prop, so the host mounts this
	 * from a small component of its own that imports it, with `client:only="svelte"`.
	 */
	import 'uncial/styles/chrome.css';
	import { onMount } from 'svelte';
	import type { ContentDocument } from 'uncial';
	import { Editor } from 'uncial/editor';
	import type { Site } from '../define-site.js';
	import type { EditorController, StatusView } from '../editor-controller.js';
	import { createEditorSession } from '../editor-session.js';
	import { UNCIAL_CMS_RUNTIME_SENTINEL } from '../sentinel.js';
	import { clearActiveForge } from '../upload-context.js';

	interface Props {
		/** The site object from `defineSite`. */
		site: Site;
		/** Repo-root-relative JSON path, from the editor route's props. */
		sourcePath: string;
		/** Site-relative page path, from the editor route's props. */
		pagePath: string;
		/** Forwarded to `Editor`; `'overlay'` keeps the document at the host's width. */
		attributesPanel?: 'docked' | 'overlay' | 'off';
		/** Forwarded to `Editor`; `'bare'` draws no surface of the editor's own. */
		presentation?: 'card' | 'bare';
	}

	let {
		site,
		sourcePath,
		pagePath,
		attributesPanel = 'overlay',
		presentation = 'bare'
	}: Props = $props();

	const signIn = $derived(site.config.forge === 'github');
	const branch = $derived(
		site.config.forge === 'github' ? site.config.branch : 'the local checkout'
	);

	let doc = $state<ContentDocument | undefined>(undefined);
	let meta = $state<Record<string, unknown>>({});
	let status = $state<StatusView | undefined>(undefined);
	let conflict = $state(false);
	let saveEnabled = $state(false);
	let started = $state(false);
	let cancelled = false;
	let controller: EditorController | undefined;

	// A sign-in popup opens a window, which browsers block outside a click, so a
	// forge that signs in waits for the button.
	function start() {
		started = true;
		controller?.load().catch((error: unknown) => {
			if (cancelled) return;
			// Offer the sign-in again: most refusals are fixed outside this page.
			if (signIn) started = false;
			status = {
				tone: 'error',
				text: error instanceof Error ? error.message : 'Failed to load the document.'
			};
		});
	}

	onMount(() => {
		controller = createEditorSession({
			config: site.config,
			sourcePath,
			pagePath,
			blocks: site.blocks,
			schemaFor: site.schemaFor,
			sessionProvider: site.sessionProvider,
			autosaveMs: site.autosaveMs,
			timings: site.deployStatusTimings,
			isDestroyed: () => cancelled,
			ui: {
				status: (view) => (status = view),
				setDocument: (next) => {
					doc = next;
					// Without this the metadata panel shows schema defaults, and
					// committing metadata would clobber the document's own.
					meta = next.meta ?? {};
				},
				saveEnabled: (enabled) => (saveEnabled = enabled),
				conflictVisible: (visible) => (conflict = visible)
			}
		});
		if (!signIn) start();
		return () => {
			cancelled = true;
			controller?.stop();
			clearActiveForge();
		};
	});
</script>

<div class="uncial-cms-editor-page" data-uncial-cms-runtime={UNCIAL_CMS_RUNTIME_SENTINEL}>
	<div class="uncial-cms-chrome">
		{#if !started}
			<button type="button" class="uncial-btn uncial-btn--primary" onclick={start}>
				Sign in with GitHub
			</button>
		{:else if site.autosaveMs === undefined && doc}
			<button
				type="button"
				class="uncial-btn uncial-btn--primary"
				disabled={!saveEnabled}
				onclick={() => void controller?.save()}
			>
				Save
			</button>
		{/if}
		{#if status}
			<p class="uncial-cms-status" role="status" data-tone={status.tone}>
				{status.text}{#if status.href}&nbsp;<a href={status.href} target="_blank" rel="noopener"
						>View commit</a
					>{/if}
			</p>
		{/if}
	</div>

	{#if conflict}
		<div class="uncial-cms-banner" role="alert">
			<p class="uncial-cms-banner-message">
				This page changed on {branch} since you loaded it. Your unsaved changes are safe — choose how
				to proceed.
			</p>
			<div class="uncial-cms-banner-actions">
				<button type="button" class="uncial-btn" onclick={() => controller?.downloadMyVersion()}>
					Download my version
				</button>
				<button type="button" class="uncial-btn" onclick={() => void controller?.reloadLatest()}>
					Reload latest
				</button>
				<button type="button" class="uncial-btn" onclick={() => controller?.dismissConflict()}>
					Dismiss
				</button>
			</div>
		</div>
	{/if}

	{#if doc}
		<Editor
			model={site}
			bind:json={doc}
			bind:meta
			path={pagePath}
			{attributesPanel}
			{presentation}
			imageSource={site.media}
			fileSource={site.files}
			onChange={(next) => controller?.documentChanged(next as ContentDocument)}
		/>
	{/if}
</div>
