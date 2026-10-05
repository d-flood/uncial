<script lang="ts">
	/**
	 * The Media library for a host's Dashboard: browse, search, upload and
	 * delete the items behind `createServerMediaHandlers`. Unstyled beyond its
	 * grid, like `EditorPage`; the host styles the `uncial-cms-media-*` classes.
	 */
	import { onMount } from 'svelte';
	import { deleteMedia, listMedia, uploadMedia } from '../server-forge/media.js';
	import type { MediaListView } from '../server-forge/protocol.js';

	interface Props {
		/** The host's media endpoint, the `server` forge's `mediaApiBase`. */
		apiBase: string;
	}

	let { apiBase }: Props = $props();

	type Item = MediaListView['items'][number];

	let search = $state('');
	let view = $state<MediaListView | undefined>(undefined);
	let error = $state('');
	let uploading = $state(0);
	let fileInput = $state<HTMLInputElement>();
	let request = 0;

	const can = (action: 'media-upload' | 'media-delete') => view?.allowed.includes(action) ?? false;
	const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason));

	async function load() {
		const current = ++request;
		try {
			const next = await listMedia(apiBase, { search: search.trim() });
			if (current === request) view = next;
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
					await uploadMedia(apiBase, file);
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

	async function remove(item: Item) {
		if (!confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
		error = '';
		try {
			await deleteMedia(apiBase, item.id);
		} catch (reason) {
			error = message(reason);
		}
		await load();
	}

	function size(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function inUse(count: number): string {
		return `In use by ${count} Content document${count === 1 ? '' : 's'}`;
	}

	onMount(() => void load());
</script>

<section class="uncial-cms-media" aria-label="Media library">
	<div class="uncial-cms-media-toolbar">
		<input
			type="search"
			class="uncial-cms-media-search"
			placeholder="Search by title or filename"
			aria-label="Search media"
			bind:value={search}
			oninput={() => void load()}
		/>
		{#if can('media-upload')}
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
			<button type="button" disabled={uploading > 0} onclick={() => fileInput?.click()}>
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

	{#if view === undefined}
		{#if !error}<p role="status">Loading media…</p>{/if}
	{:else if view.items.length === 0}
		<p>{search.trim() ? 'No media matches that search.' : 'No media yet.'}</p>
	{:else}
		<ul class="uncial-cms-media-grid">
			{#each view.items as item (item.id)}
				<li class="uncial-cms-media-item">
					<a class="uncial-cms-media-preview" href={item.url} target="_blank" rel="noopener">
						{#if item.contentType.startsWith('image/')}
							<img src={item.url} alt="" loading="lazy" />
						{:else}
							<span>{item.key.split('.').at(-1)?.toUpperCase()}</span>
						{/if}
					</a>
					<p class="uncial-cms-media-title">{item.title}</p>
					<p class="uncial-cms-media-meta">
						{item.filename} · {#if item.width && item.height}{item.width}×{item.height} · {/if}{size(
							item.size
						)}
					</p>
					<p class="uncial-cms-media-usage">
						{item.usage > 0 ? inUse(item.usage) : 'Not in use'}
					</p>
					{#if can('media-delete')}
						<button
							type="button"
							disabled={item.usage > 0}
							title={item.usage > 0 ? `${inUse(item.usage)}, so it cannot be deleted.` : undefined}
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

	.uncial-cms-media-meta {
		overflow-wrap: anywhere;
	}
</style>
