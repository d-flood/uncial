<script lang="ts">
	/**
	 * The SvelteKit door onto an Editor variant: Uncial's `Editor` rendered in
	 * the host's own tree and cascade, with the whole editing surface
	 * `mountEditorPage` owns — status line, conflict banner, metadata seeding,
	 * Save or autosave — around it.
	 *
	 * `mountEditorPage` builds a custom element with a shadow root, which is the
	 * right shape for a host with no component model. It is the wrong shape for a
	 * SvelteKit site whose Editor variant exists to show an author the measure,
	 * face and ground a reader will see: no rule the site sets on `body` crosses
	 * that boundary, so the site has to restate every one of them.
	 */
	import { onMount } from 'svelte';
	import type { BlockRegistry, ContentDocument, ContentSchema } from 'uncial/core';
	import type { Site } from '../define-site.js';
	import type { EditorController, StatusView } from '../editor-controller.js';
	import { UNCIAL_CMS_RUNTIME_SENTINEL } from '../sentinel.js';
	import type { SessionProvider } from '../types.js';
	import { clearActiveForge } from '../upload-context.js';

	interface Props {
		/** The site object from `defineSite`. */
		site: Site;
		/** Repo-root-relative JSON path, from the editor route's payload. */
		sourcePath: string;
		/** Site-relative page path, from the editor route's payload. */
		pagePath: string;
		blocks: BlockRegistry;
		/** One schema for the site, or the schema this page path is written against. */
		schema: ContentSchema | ((path: string) => ContentSchema);
		/** Defaults to the provider the resolved forge implies. */
		sessionProvider?: SessionProvider;
		/** Forwarded to `Editor`; `'overlay'` keeps the document at the host's width. */
		attributesPanel?: 'docked' | 'overlay' | 'off';
		/** Forwarded to `Editor`; `'bare'` draws no surface of the editor's own. */
		presentation?: 'card' | 'bare';
	}

	let {
		site,
		sourcePath,
		pagePath,
		blocks,
		schema,
		sessionProvider,
		attributesPanel = 'overlay',
		presentation = 'bare'
	}: Props = $props();

	const resolvedSchema = $derived(typeof schema === 'function' ? schema(pagePath) : schema);
	// Autosave leaves nothing to press; a forge commit is never autosaved, so a
	// Save button and autosave are exactly the two modes.
	const manualSave = $derived(site.autosaveMs === undefined);
	const branch = $derived(
		site.config.forge === 'github' ? site.config.branch : 'the local checkout'
	);

	type EditorComponent = (typeof import('uncial/editor'))['Editor'];

	let Editor = $state<EditorComponent | undefined>(undefined);
	let doc = $state<ContentDocument | undefined>(undefined);
	let meta = $state<Record<string, unknown>>({});
	let status = $state<StatusView | undefined>(undefined);
	let conflict = $state(false);
	let saveEnabled = $state(false);
	let controller: EditorController | undefined;
	let root: HTMLDivElement;

	onMount(() => {
		// The editor stack hangs off dynamic imports behind a statically decidable
		// condition, so a local-only production build has no reachable path to it
		// and drops it rather than merely leaving it unrouted. Vite replaces both
		// operands with literals at build time.
		if (!import.meta.env.DEV && import.meta.env.UNCIAL_CMS_FORGE === 'none') return;

		// Marked here rather than in the markup so that the gate above leaves the
		// sentinel unreferenced in a local-only production build, and Rollup drops
		// it with the rest of the editor stack.
		root.dataset.uncialCmsRuntime = UNCIAL_CMS_RUNTIME_SENTINEL;

		let cancelled = false;

		void Promise.all([
			import('uncial/editor'),
			// The package's own session module, not the `uncial-cms/session`
			// subpath: this file is inside the package.
			import('../editor-session.js'),
			// The editor's chrome — tokens, shell layout and controls. Loaded here
			// so the host never has to know the component has a stylesheet.
			import('uncial/styles/chrome')
		]).then(([editor, session]) => {
			if (cancelled) return;
			Editor = editor.Editor;
			controller = session.createEditorSession({
				config: site.config,
				sourcePath,
				pagePath,
				blocks,
				schema: resolvedSchema,
				sessionProvider,
				autosaveMs: site.autosaveMs,
				isDestroyed: () => cancelled,
				ui: {
					status: (view) => (status = view),
					setDocument: (next) => {
						doc = next;
						// Seed the metadata panel from the loaded document. Without
						// this it shows schema defaults, and committing metadata
						// would clobber the document's own.
						meta = next.meta ?? {};
					},
					saveEnabled: (enabled) => (saveEnabled = enabled),
					conflictVisible: (visible) => (conflict = visible)
				}
			});
			void controller.load().catch((error: unknown) => {
				if (cancelled) return;
				status = {
					tone: 'error',
					text: error instanceof Error ? error.message : 'Failed to load the document.'
				};
			});
		});

		return () => {
			cancelled = true;
			controller?.stop();
			clearActiveForge();
		};
	});
</script>

<div class="uncial-cms-editor-page" bind:this={root}>
	<div class="uncial-cms-chrome">
		{#if manualSave}
			<button type="button" disabled={!saveEnabled} onclick={() => void controller?.save()}>
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
				<button type="button" onclick={() => controller?.downloadMyVersion()}>
					Download my version
				</button>
				<button type="button" onclick={() => void controller?.reloadLatest()}>Reload latest</button>
				<button type="button" onclick={() => controller?.dismissConflict()}>Dismiss</button>
			</div>
		</div>
	{/if}

	{#if Editor && doc}
		<Editor
			{blocks}
			schema={resolvedSchema}
			metaFields={resolvedSchema.metaFields}
			bind:json={doc}
			bind:meta
			{attributesPanel}
			{presentation}
			onChange={(next) => controller?.documentChanged(next as ContentDocument)}
		/>
	{/if}
</div>
