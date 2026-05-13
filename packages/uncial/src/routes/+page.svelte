<script lang="ts">
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import EyeIcon from 'phosphor-svelte/lib/EyeIcon';
	import BracketsCurlyIcon from 'phosphor-svelte/lib/BracketsCurlyIcon';
	import GithubLogoIcon from 'phosphor-svelte/lib/GithubLogoIcon';
	import { resolve } from '$app/paths';
	import { BlockAttributesPanel, Editor, Renderer } from '$lib/index.js';
	import { buildDemo } from './demo.js';
	import Logo from './demo/Logo.svelte';
	import ThemeSwitcher from '$lib/ui/ThemeSwitcher.svelte';

	const { blocks, schema, attributesController, metaController, initialDocument } = buildDemo();
	const pageWashBackground =
		'radial-gradient(1200px 600px at 80% 0%, color-mix(in srgb, var(--color-accent) 12%, transparent), transparent 55%), radial-gradient(900px 700px at 10% 90%, color-mix(in srgb, var(--color-primary) 7%, transparent), transparent 60%)';
	const repoUrl = 'https://github.com/d-flood/uncial';
	const docsUrl = resolve('/docs');
	let doc = $state(initialDocument);
	let meta = $state(initialDocument.meta ?? {});
	let activeTab = $state<'editor' | 'rendered' | 'json'>('editor');
	let editorRegion = $state<HTMLElement>();
	let mobilePanelTop = $state(112);
	let mobilePanelOpen = $state(false);
	let viewportWidth = $state(0);
	let scrollY = $state(0);
	const formattedJson = $derived(JSON.stringify(doc, null, 2));
	const highlightedJson = $derived.by(() => tokenizeJson(formattedJson));
	const isMobileEditor = $derived(activeTab === 'editor' && viewportWidth < 1024);
	const mobilePanelVisible = $derived(isMobileEditor && mobilePanelOpen);
	const mobilePanelStyle = $derived(`top: ${mobilePanelTop}px`);
	type JsonToken = {
		offset: number;
		text: string;
		type: 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation' | 'plain';
	};

	const jsonTokenPattern =
		/("(?:\\.|[^"\\])*"(?=\s*:))|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\bnull\b|([{}[\],:])/g;

	function tokenizeJson(json: string): JsonToken[] {
		const tokens: JsonToken[] = [];
		let cursor = 0;

		for (const match of json.matchAll(jsonTokenPattern)) {
			const index = match.index ?? 0;

			if (index > cursor) {
				tokens.push({ offset: cursor, text: json.slice(cursor, index), type: 'plain' });
			}

			const text = match[0];
			let type: JsonToken['type'] = 'punctuation';

			if (match[1]) type = 'key';
			else if (match[2]) type = 'string';
			else if (match[3]) type = 'number';
			else if (match[4]) type = 'boolean';
			else if (text === 'null') type = 'null';

			tokens.push({ offset: index, text, type });
			cursor = index + text.length;
		}

		if (cursor < json.length) {
			tokens.push({ offset: cursor, text: json.slice(cursor), type: 'plain' });
		}

		return tokens;
	}

	function updateMobilePanelPosition(): void {
		if (!editorRegion || !isMobileEditor || !mobilePanelOpen) return;

		const activeBlock = editorRegion.querySelector<HTMLElement>('.uncial-active-block');
		const anchor = activeBlock ?? editorRegion.querySelector<HTMLElement>('.uncial-editor-shell');
		if (!anchor) return;

		const rect = anchor.getBoundingClientRect();
		const bottomSpace = window.innerHeight - rect.bottom;
		const preferredTop = rect.bottom + 10;
		const fallbackTop = Math.max(72, rect.top + 12);
		mobilePanelTop = Math.round(
			Math.min(bottomSpace > 220 ? preferredTop : fallbackTop, window.innerHeight - 88)
		);
	}

	$effect(() => {
		const unsubscribe = attributesController.subscribe((state) => {
			mobilePanelOpen = state.open || state.link.open;
		});

		return unsubscribe;
	});

	$effect(() => {
		void activeTab;
		void mobilePanelOpen;
		void viewportWidth;
		void scrollY;
		requestAnimationFrame(updateMobilePanelPosition);
	});
</script>

<svelte:window bind:innerWidth={viewportWidth} bind:scrollY />

<svelte:head>
	<title>Uncial · CMS Block Editor</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-clip bg-base-100 pb-14">
	<div
		class="pointer-events-none absolute inset-0 opacity-[0.22]"
		style:background={pageWashBackground}
		aria-hidden="true"
	></div>

	<header class="relative mx-auto max-w-368 px-6 pt-8 sm:px-10">
		<div class="border-b border-base-content/20 pb-5">
			<div class="flex items-center justify-center gap-4">
				<Logo size="8rem" class="text-primary" />
				<h1
					class="font-vellum-display text-center text-5xl font-black italic leading-none tracking-tight sm:text-6xl"
				>
					Uncial
				</h1>
			</div>
			<p
				class="font-vellum-mono mx-auto mt-5 max-w-3xl text-center text-[0.92rem] font-bold uppercase leading-normal tracking-[0.09em] text-base-content/78 sm:text-[1rem]"
			>
				The backend-agnostic CMS block editor <em class="text-primary not-italic">and</em> renderer.
				<br />
				Define custom blocks once as components, and reuse them seamlessly across your WYSIWYG editor
				and frontend.
			</p>
			<nav aria-label="Project links" class="mt-6 flex flex-wrap justify-center gap-3">
				<a href={repoUrl} target="_blank" rel="noreferrer" class="btn btn-primary btn-sm">
					<GithubLogoIcon size={16} weight="bold" />
					GitHub repo
				</a>
				<a href={docsUrl} class="btn btn-outline btn-secondary btn-sm"> Docs </a>
				<ThemeSwitcher />
			</nav>
		</div>
	</header>

	<section
		id="press"
		class="relative mx-auto mt-6 max-w-368 px-6 sm:px-10"
		aria-labelledby="page-document-heading"
	>
		<h2 id="page-document-heading" class="sr-only">Editable Uncial homepage document</h2>
		<header class="mb-4 flex flex-wrap items-center justify-between gap-4">
			<div
				role="tablist"
				aria-label="Demo views"
				class="inline-flex rounded border border-base-content/30 bg-base-100/70"
			>
				{#each [{ id: 'editor', label: 'Editor', Icon: PencilSimpleIcon }, { id: 'rendered', label: 'Rendered', Icon: EyeIcon }, { id: 'json', label: 'JSON', Icon: BracketsCurlyIcon }] as tab, i (tab.id)}
					{@const Icon = tab.Icon}
					<button
						type="button"
						role="tab"
						aria-selected={activeTab === tab.id}
						onclick={() => (activeTab = tab.id as typeof activeTab)}
						class={[
							'font-vellum-mono flex items-center gap-2 px-4 py-2 text-[0.68rem] uppercase tracking-[0.25em] transition cursor-pointer',
							i > 0 && 'border-l border-base-content/20',
							activeTab === tab.id ? 'bg-primary text-primary-content' : 'hover:bg-base-200/70'
						]}
					>
						<Icon size={12} weight="bold" />
						{tab.label}
					</button>
				{/each}
			</div>
		</header>

		<div class="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
			<div class="min-w-0">
				{#if activeTab === 'editor'}
					<div class="min-w-0" role="region" aria-label="Editor" bind:this={editorRegion}>
						<Editor {blocks} {schema} {attributesController} {metaController} bind:json={doc} bind:meta />
					</div>
				{:else if activeTab === 'rendered'}
					<article role="region" aria-label="Rendered">
						<p class="font-vellum-mono text-[0.62rem] uppercase tracking-[0.3em] text-secondary/80">
							Proof copy · same JSON
						</p>
						<Renderer {blocks} {schema} content={doc}>
							{#snippet meta(meta)}
								{#if meta?.title}
									<header class="mb-6 border-b border-base-content/15 pb-4">
										<p class="font-vellum-mono text-[0.62rem] uppercase tracking-[0.3em] text-primary">
											{meta.author ?? 'Unknown author'} · {meta.publishedAt ?? 'Unpublished'}
										</p>
										<h2 class="mt-2 font-vellum-display text-3xl font-black italic">
											{meta.title}
										</h2>
									</header>
								{/if}
							{/snippet}
						</Renderer>
					</article>
				{:else}
					<pre
						class="json-preview font-vellum-mono max-h-[65dvh] overflow-auto rounded bg-base-200 p-6 text-[0.88rem] leading-6"><code
							>{#each highlightedJson as token (token.offset)}<span
									class={`json-token-${token.type}`}>{token.text}</span
								>{/each}</code
						></pre>
				{/if}
			</div>
			{#if activeTab === 'editor'}
				<aside
					class={[
						'attribute-panel-shell self-start rounded border border-base-content/20 bg-base-200/35 lg:sticky lg:top-6',
						mobilePanelVisible && 'is-mobile-open'
					]}
					aria-label="Block attributes"
					style={mobilePanelStyle}
				>
					<div class="border-b border-base-content/20 px-4 py-2">
						<p class="font-vellum-mono text-[0.62rem] uppercase tracking-[0.3em] text-primary">
							Attribute panel
						</p>
					</div>
					<div class="p-4">
						<BlockAttributesPanel controller={attributesController} {blocks} />
					</div>
				</aside>
			{:else}
				<div aria-hidden="true"></div>
			{/if}
		</div>
	</section>
</main>

<style>
	.attribute-panel-shell {
		transition:
			opacity 140ms ease,
			transform 140ms ease;
	}

	.json-preview {
		color: color-mix(in srgb, var(--color-base-content) 74%, transparent);
	}

	.json-token-key {
		color: var(--color-primary);
	}

	.json-token-string {
		color: var(--color-secondary);
	}

	.json-token-number {
		color: color-mix(in srgb, var(--color-accent) 78%, var(--color-base-content));
	}

	.json-token-boolean,
	.json-token-null {
		color: color-mix(in srgb, var(--color-info) 84%, var(--color-base-content));
		font-weight: 700;
	}

	.json-token-punctuation {
		color: color-mix(in srgb, var(--color-base-content) 46%, transparent);
	}

	@media (max-width: 1023px) {
		.attribute-panel-shell {
			position: fixed;
			left: max(0.75rem, env(safe-area-inset-left));
			right: max(0.75rem, env(safe-area-inset-right));
			z-index: 40;
			max-height: min(62dvh, 28rem);
			overflow: auto;
			background: color-mix(in srgb, var(--color-base-100) 94%, transparent);
			box-shadow: 0 22px 70px color-mix(in srgb, var(--color-base-content) 20%, transparent);
			opacity: 0;
			pointer-events: none;
			transform: translateY(-0.4rem) scale(0.98);
			backdrop-filter: blur(14px);
		}

		.attribute-panel-shell.is-mobile-open {
			opacity: 1;
			pointer-events: auto;
			transform: translateY(0) scale(1);
		}
	}
</style>
