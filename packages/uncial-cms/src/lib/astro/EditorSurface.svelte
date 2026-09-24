<script lang="ts">
	/**
	 * An Astro editor route's island: Uncial's `Editor` in the host's own tree
	 * and cascade, driven by the headless editor session, with the status line,
	 * conflict banner and Save or autosave around it.
	 *
	 * Blocks, schemas and Tiptap extensions are not serializable island props,
	 * so the host mounts this from a small component of its own that imports
	 * them, with `client:only="svelte"`.
	 */
	import 'uncial/styles/chrome.css';
	import { onMount, type ComponentProps } from 'svelte';
	import type { BlockRegistry, ContentDocument, ContentSchema } from 'uncial/core';
	import {
		Editor,
		type ImageSource,
		type ToolbarFeature,
		type ToolbarFeatureSelection
	} from 'uncial/editor';
	import type { Site } from '../define-site.js';
	import type { EditorController, StatusView } from '../editor-controller.js';
	import { createEditorSession } from '../editor-session.js';
	import { cmsImageSource } from '../image-source.js';
	import { UNCIAL_CMS_RUNTIME_SENTINEL } from '../sentinel.js';
	import type { SessionProvider } from '../types.js';
	import { clearActiveForge } from '../upload-context.js';

	interface Props {
		/** The site object from `defineSite`. */
		site: Site;
		/** Repo-root-relative JSON path, from the editor route's props. */
		sourcePath: string;
		/** Site-relative page path, from the editor route's props. */
		pagePath: string;
		blocks: BlockRegistry;
		/** One schema for the site, or the schema this page path is written against. */
		schema: ContentSchema | ((path: string) => ContentSchema);
		/** Defaults to the provider the resolved forge implies. */
		sessionProvider?: SessionProvider;
		/** Forwarded to `Editor`: the Tiptap extensions behind custom marks. */
		extensions?: ComponentProps<typeof Editor>['extensions'];
		/** Forwarded to `Editor`. */
		toolbarFeatures?: ToolbarFeatureSelection;
		/** Forwarded to `Editor`. */
		toolbarExtensions?: ToolbarFeature[];
		/** Forwarded to `Editor`; `'overlay'` keeps the document at the host's width. */
		attributesPanel?: 'docked' | 'overlay' | 'off';
		/** Forwarded to `Editor`; `'bare'` draws no surface of the editor's own. */
		presentation?: 'card' | 'bare';
		/** Forwarded to `Editor`; defaults to `cmsImageSource(site.config)`. */
		imageSource?: ImageSource;
	}

	let {
		site,
		sourcePath,
		pagePath,
		blocks,
		schema,
		sessionProvider,
		extensions,
		toolbarFeatures,
		toolbarExtensions,
		attributesPanel = 'overlay',
		presentation = 'bare',
		imageSource
	}: Props = $props();

	const resolvedSchema = $derived(typeof schema === 'function' ? schema(pagePath) : schema);
	const resolvedImageSource = $derived(imageSource ?? cmsImageSource(site.config));
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
			<button type="button" onclick={start}>Sign in with GitHub</button>
		{:else if site.autosaveMs === undefined && doc}
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

	{#if doc}
		<Editor
			{blocks}
			schema={resolvedSchema}
			metaFields={resolvedSchema.metaFields}
			bind:json={doc}
			bind:meta
			{extensions}
			{toolbarFeatures}
			{toolbarExtensions}
			{attributesPanel}
			{presentation}
			imageSource={resolvedImageSource}
			onChange={(next) => controller?.documentChanged(next as ContentDocument)}
		/>
	{/if}
</div>
