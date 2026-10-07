<svelte:options css="injected" />

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resolveImageSrc } from 'uncial/render';
	import { serverMediaSource, type MediaItem, type MediaSource } from '../media-source.js';
	import type { Action } from '../server-forge/protocol.js';

	type MediaAction = 'media-upload' | 'media-delete';

	interface Props {
		source?: MediaSource;
		/** @deprecated Pass `source`; this builds the `server` forge's source over its `mediaApiBase`. */
		apiBase?: string;
		can?: (action: MediaAction, item?: MediaItem) => boolean;
		confirmDelete?: (item: MediaItem) => Promise<boolean>;
		/** The site's base path, for previewing the base-less URLs a git forge's items carry. */
		base?: string;
		onerror?: (error: unknown) => void;
	}

	let { source, apiBase, can, confirmDelete, base = '', onerror }: Props = $props();

	let allowed = $state<Action[]>([]);
	const media = $derived.by(() => {
		if (source) return source;
		if (!apiBase) throw new Error('MediaLibrary needs a `source`.');
		return serverMediaSource(apiBase, (next) => (allowed = next));
	});
	const capabilities = $derived(media.capabilities);

	let search = $state('');
	let items = $state<MediaItem[] | undefined>(undefined);
	let error = $state('');
	let uploading = $state(0);
	let fileInput = $state<HTMLInputElement>();
	let section = $state<HTMLElement>();
	let request = 0;

	// Under the deprecated `apiBase`, the server's own answer of what the user may do.
	const may = (action: MediaAction, item?: MediaItem) =>
		can ? can(action, item) : source !== undefined || allowed.includes(action);
	const message = (reason: unknown) => {
		onerror?.(reason);
		return reason instanceof Error ? reason.message : String(reason);
	};
	const nameOf = (item: MediaItem) => (capabilities.metadata && item.title) || item.filename;
	const ask = (item: MediaItem) =>
		confirmDelete
			? confirmDelete(item)
			: Promise.resolve(confirm(`Delete “${nameOf(item)}”? This cannot be undone.`));

	async function load() {
		const current = ++request;
		try {
			const next = await media.list(capabilities.search ? { search: search.trim() } : {});
			if (current === request) items = next;
		} catch (reason) {
			if (current === request) error = message(reason);
		}
	}

	async function upload(files: File[]) {
		error = '';
		uploading += files.length;
		try {
			for (const file of files) {
				try {
					await media.upload(file);
				} catch (reason) {
					error = `${file.name}: ${message(reason)}`;
				} finally {
					uploading -= 1;
				}
			}
		} finally {
			await load();
		}
	}

	async function remove(item: MediaItem) {
		error = '';
		try {
			if (!(await ask(item))) return;
			await media.delete(item);
		} catch (reason) {
			error = message(reason);
			await load();
			return;
		}
		await load();
		// The deleted item's button went with it.
		await tick();
		section?.focus();
	}

	function size(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function details(item: MediaItem): string {
		const dimensions = item.width && item.height ? `${item.width}×${item.height}` : '';
		return [item.filename, dimensions, item.size === undefined ? '' : size(item.size)]
			.filter(Boolean)
			.join(' · ');
	}

	function usage(item: MediaItem): string {
		const uses = item.usage ?? [];
		if (uses.length === 0) return 'Not in use';
		const paths = uses.map((use) => use.title || use.path).join(', ');
		return `In use by ${uses.length} Content document${uses.length === 1 ? '' : 's'}: ${paths}`;
	}

	onMount(() => void load());
</script>

<section bind:this={section} class="uncial-cms-media" aria-label="Media library" tabindex="-1">
	<div class="uncial-cms-media-toolbar">
		{#if capabilities.search}
			<input
				type="search"
				class="uncial-cms-media-search"
				placeholder="Search by title or filename"
				aria-label="Search media"
				bind:value={search}
				oninput={() => void load()}
			/>
		{/if}
		{#if may('media-upload')}
			<input
				bind:this={fileInput}
				type="file"
				multiple
				hidden
				onchange={(event) => {
					const target = event.currentTarget as HTMLInputElement;
					const files = [...(target.files ?? [])];
					target.value = '';
					if (files.length) void upload(files);
				}}
			/>
			<button
				type="button"
				class="uncial-cms-media-upload"
				disabled={uploading > 0}
				onclick={() => fileInput?.click()}
			>
				Upload
			</button>
		{/if}
		{#if uploading > 0}
			<p class="uncial-cms-media-status" role="status">Uploading {uploading}…</p>
		{/if}
	</div>

	{#if error}
		<p class="uncial-cms-media-error" role="alert">{error}</p>
	{/if}

	{#if items === undefined}
		{#if !error}<p role="status">Loading media…</p>{/if}
	{:else if items.length === 0}
		<p>{search.trim() ? 'No media matches that search.' : 'No media yet.'}</p>
	{:else}
		<ul class="uncial-cms-media-grid">
			{#each items as item (item.id)}
				<li class="uncial-cms-media-item">
					<a
						class="uncial-cms-media-preview"
						href={resolveImageSrc(item.url, base)}
						target="_blank"
						rel="noopener"
						aria-label="Open {nameOf(item)}"
					>
						{#if item.contentType.startsWith('image/')}
							<img src={resolveImageSrc(item.url, base)} alt="" loading="lazy" />
						{:else}
							<span>{item.filename.split('.').at(-1)?.toUpperCase()}</span>
						{/if}
					</a>
					{#if capabilities.metadata}
						<p class="uncial-cms-media-title">{item.title}</p>
					{/if}
					<p class="uncial-cms-media-meta">{details(item)}</p>
					{#if capabilities.usage}
						<p class="uncial-cms-media-usage">{usage(item)}</p>
					{/if}
					{#if capabilities.delete && may('media-delete', item)}
						<button
							type="button"
							class="uncial-cms-media-delete"
							aria-label="Delete {nameOf(item)}"
							onclick={() => void remove(item)}
						>
							Delete
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.uncial-cms-media-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
		gap: 1rem;
		padding: 0;
		list-style: none;
	}

	.uncial-cms-media-item {
		min-width: 0;
	}

	.uncial-cms-media-preview {
		display: grid;
		place-items: center;
		aspect-ratio: 4 / 3;
		overflow: hidden;
	}

	.uncial-cms-media-preview img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.uncial-cms-media-meta,
	.uncial-cms-media-usage {
		overflow-wrap: anywhere;
	}

	@media (max-width: 40rem) {
		.uncial-cms-media-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
