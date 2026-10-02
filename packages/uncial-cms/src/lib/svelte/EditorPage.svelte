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
	import { SvelteSet } from 'svelte/reactivity';
	import type { BlockRegistry, ContentDocument, ContentSchema } from 'uncial/core';
	import type { ImageSource } from 'uncial/editor';
	import type { Site } from '../define-site.js';
	import type { EditorController, RecordState, StatusView } from '../editor-controller.js';
	import { cmsImageSource } from '../image-source.js';
	import { isMediaUrl, listMedia } from '../server-forge/media.js';
	import { UNCIAL_CMS_RUNTIME_SENTINEL } from '../sentinel.js';
	import {
		contentStatus,
		describeContentStatus,
		type Action,
		type VersionView
	} from '../server-forge/protocol.js';
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
		/** Forwarded to `Editor`; defaults to `cmsImageSource(site.config)`. */
		imageSource?: ImageSource;
		/** Where the host previews a Draft; the editing view links there when given. */
		previewUrl?: (sourcePath: string) => string;
		/** The record moved, by a save that derived a new path or by Move; reopen it at `sourcePath`. */
		onMoved?: (sourcePath: string) => void;
		/** Offer Move, for records whose path an author chooses rather than one their metadata derives. */
		movable?: boolean;
	}

	let {
		site,
		sourcePath,
		pagePath,
		blocks,
		schema,
		sessionProvider,
		attributesPanel = 'overlay',
		presentation = 'bare',
		imageSource,
		previewUrl,
		onMoved,
		movable = false
	}: Props = $props();

	const resolvedSchema = $derived(typeof schema === 'function' ? schema(pagePath) : schema);
	// Autosave leaves nothing to press; a forge commit is never autosaved, so a
	// Save button and autosave are exactly the two modes.
	const manualSave = $derived(site.autosaveMs === undefined);
	const mediaApiBase = $derived(site.config.forge === 'server' ? site.config.mediaApiBase : undefined);
	// The Media library's URLs, so the editing view can flag media that is gone.
	let library = $state<SvelteSet<string> | undefined>(undefined);
	let libraryChecked = $state(false);
	const isMissing = (src: string) => (library ? isMediaUrl(src) && !library.has(src) : false);
	const resolvedImageSource = $derived.by((): ImageSource => {
		const source = imageSource ?? cmsImageSource(site.config);
		const { upload } = source;
		if (!mediaApiBase) return source;
		return {
			...source,
			upload:
				upload &&
				(async (file) => {
					const src = await upload(file);
					library?.add(src);
					return src;
				}),
			missing: isMissing
		};
	});
	const missingMedia = $derived.by(() => {
		const found = new Set<string>();
		const walk = (value: unknown): void => {
			if (typeof value === 'string') {
				if (isMissing(value)) found.add(value);
			} else if (value && typeof value === 'object') {
				Object.values(value).forEach(walk);
			}
		};
		walk(doc);
		return [...found];
	});
	const branch = $derived(
		site.config.forge === 'github'
			? site.config.branch
			: site.config.forge === 'server'
				? 'the server'
				: 'the local checkout'
	);

	type EditorComponent = (typeof import('uncial/editor'))['Editor'];
	type RendererComponent = (typeof import('uncial/render'))['Renderer'];

	let Editor = $state<EditorComponent | undefined>(undefined);
	let doc = $state<ContentDocument | undefined>(undefined);
	let meta = $state<Record<string, unknown>>({});
	let status = $state<StatusView | undefined>(undefined);
	let conflict = $state(false);
	let saveEnabled = $state(false);
	let record = $state<RecordState | undefined>(undefined);
	let deleted = $state(false);
	const can = (action: Action) => record?.allowed.includes(action) ?? false;
	let moveTo = $state<string | undefined>(undefined);
	let historyOpen = $state(false);
	let versions = $state<VersionView[] | undefined>(undefined);
	let selected = $state<{ id: string; doc: ContentDocument } | undefined>(undefined);
	let Renderer = $state<RendererComponent | undefined>(undefined);
	let controller: EditorController | undefined;
	let root: HTMLDivElement;

	const failed = (error: unknown, fallback: string) =>
		(status = { tone: 'error', text: error instanceof Error ? error.message : fallback });

	function closeHistory() {
		historyOpen = false;
		versions = undefined;
		selected = undefined;
	}

	async function openHistory() {
		if (!controller) return;
		historyOpen = true;
		try {
			const [list, render] = await Promise.all([controller.history(), import('uncial/render')]);
			versions = list;
			Renderer = render.Renderer;
		} catch (error) {
			failed(error, 'Failed to load the history.');
		}
	}

	async function select(versionId: string) {
		try {
			selected = { id: versionId, doc: await controller!.version(versionId) };
		} catch (error) {
			failed(error, 'Failed to load the Version.');
		}
	}

	async function restore(versionId: string) {
		if (await controller?.restore(versionId)) closeHistory();
	}

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

		if (mediaApiBase) {
			listMedia(mediaApiBase)
				.then((view) => (library = new SvelteSet(view.items.map((item) => item.url))))
				// Without the list nothing can be flagged missing; the editor still opens.
				.catch(() => {})
				.finally(() => (libraryChecked = true));
		} else {
			libraryChecked = true;
		}

		void Promise.all([
			import('uncial/editor'),
			// The package's own session module, not the `uncial-cms/session`
			// subpath: this file is inside the package.
			import('../editor-session.js'),
			// The editor's chrome — tokens, shell layout and controls. Loaded here
			// so the host never has to know the component has a stylesheet. The
			// .css extension keeps Vite's dep optimizer from swallowing it.
			import('uncial/styles/chrome.css')
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
				timings: site.deployStatusTimings,
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
					conflictVisible: (visible) => (conflict = visible),
					record: (next) => (record = next),
					moved: (path) => onMoved?.(path)
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
		{#if manualSave && !deleted}
			<button type="button" disabled={!saveEnabled} onclick={() => void controller?.save()}>
				Save
			</button>
		{/if}
		{#if record && !deleted}
			<p class="uncial-cms-record-status">
				{describeContentStatus(contentStatus(record.draft, record.published))}
			</p>
			{#if can('publish')}
				<button type="button" disabled={!saveEnabled} onclick={() => void controller?.publish()}>
					Publish
				</button>
			{/if}
			{#if can('unpublish') && record.published}
				<button type="button" disabled={!saveEnabled} onclick={() => void controller?.unpublish()}>
					Unpublish
				</button>
			{/if}
			<button
				type="button"
				aria-expanded={historyOpen}
				onclick={() => (historyOpen ? closeHistory() : void openHistory())}
			>
				History
			</button>
			{#if movable && can('move')}
				<button
					type="button"
					aria-expanded={moveTo !== undefined}
					onclick={() => (moveTo = moveTo === undefined ? sourcePath : undefined)}
				>
					Move
				</button>
			{/if}
			{#if can('delete')}
				<button
					type="button"
					disabled={!saveEnabled}
					onclick={async () => (deleted = (await controller?.remove()) ?? false)}
				>
					Delete
				</button>
			{/if}
		{/if}
		{#if previewUrl && !deleted}
			<a class="uncial-cms-preview" href={previewUrl(sourcePath)} target="_blank" rel="noopener">
				Preview
			</a>
		{/if}
		{#if status}
			<p class="uncial-cms-status" role="status" data-tone={status.tone}>
				{status.text}{#if status.href}&nbsp;<a href={status.href} target="_blank" rel="noopener"
						>View commit</a
					>{/if}
			</p>
		{/if}
	</div>

	{#if moveTo !== undefined && !deleted}
		<form
			class="uncial-cms-move"
			onsubmit={(event) => {
				event.preventDefault();
				void controller?.move(moveTo!);
			}}
		>
			<label>New path <input type="text" bind:value={moveTo} required /></label>
			<button type="submit" disabled={!saveEnabled || moveTo === sourcePath}>Move here</button>
		</form>
	{/if}

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

	{#if missingMedia.length > 0 && !deleted}
		<div class="uncial-cms-banner uncial-cms-missing-media" role="alert">
			<p class="uncial-cms-banner-message">
				{missingMedia.length === 1 ? 'An image' : `${missingMedia.length} images`} on this page {missingMedia.length ===
				1
					? 'is'
					: 'are'} no longer in the Media library. The editing view shows a placeholder; readers see no
				image. Choose a replacement or clear it.
			</p>
		</div>
	{/if}

	{#if historyOpen && !deleted}
		<section class="uncial-cms-history" aria-label="History">
			{#if versions === undefined}
				<p>Loading history…</p>
			{:else if versions.length === 0}
				<p>No earlier Versions yet. Each publish keeps the copy it replaces.</p>
			{:else}
				<ol class="uncial-cms-history-list">
					{#each versions as version (version.id)}
						<li>
							<button
								type="button"
								aria-pressed={selected?.id === version.id}
								onclick={() => void select(version.id)}
							>
								{new Date(version.createdAt).toLocaleString()} · {version.createdBy}
							</button>
						</li>
					{/each}
				</ol>
			{/if}
			{#if selected && Renderer}
				{@const versionId = selected.id}
				<div class="uncial-cms-version" aria-label="Selected Version">
					{#if can('restore')}
						<button type="button" onclick={() => void restore(versionId)}>Restore</button>
					{/if}
					<Renderer content={selected.doc} {blocks} schema={resolvedSchema} />
				</div>
			{/if}
		</section>
	{/if}

	{#if Editor && doc && libraryChecked && !deleted}
		<Editor
			{blocks}
			schema={resolvedSchema}
			metaFields={resolvedSchema.metaFields}
			bind:json={doc}
			bind:meta
			{attributesPanel}
			{presentation}
			imageSource={resolvedImageSource}
			onChange={(next) => controller?.documentChanged(next as ContentDocument)}
		/>
	{/if}
</div>
