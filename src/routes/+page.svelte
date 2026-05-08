<script lang="ts">
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import EyeIcon from 'phosphor-svelte/lib/EyeIcon';
	import BracketsCurlyIcon from 'phosphor-svelte/lib/BracketsCurlyIcon';
	import {
		BlockAttributesPanel,
		Editor,
		Renderer,
		createBlockAttributesController,
		createBlockRegistry,
		createSchema,
		defineBlock,
		hasRichTextContent,
		richTextDocument
	} from '../lib/index.js';
	import Callout from './demo/Callout.svelte';
	import Card from './demo/Card.svelte';
	import RowView from './demo/RowView.svelte';

	function isNonEmptyString(value: unknown): value is string {
		return typeof value === 'string' && value.trim().length > 0;
	}

	type DemoNode = {
		type: string;
		attrs?: Record<string, unknown>;
		text?: string;
		content?: DemoNode[];
	};

	type DemoDocument = {
		type: 'doc';
		version: number;
		content: DemoNode[];
	};

	type JsonToken = {
		text: string;
		kind: 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation';
	};

	function highlightJson(json: string): JsonToken[] {
		const tokenPattern =
			/("(?:\\.|[^"\\])*"(?=\s*:))|("(?:\\.|[^"\\])*")|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\],:]/g;
		const tokens: JsonToken[] = [];
		let cursor = 0;

		for (const match of json.matchAll(tokenPattern)) {
			const text = match[0];
			const index = match.index ?? 0;

			if (index > cursor) {
				tokens.push({ text: json.slice(cursor, index), kind: 'punctuation' });
			}

			tokens.push({
				text,
				kind: match[1]
					? 'key'
					: match[2]
						? 'string'
						: text === 'true' || text === 'false'
							? 'boolean'
							: text === 'null'
								? 'null'
								: /^-?\d/.test(text)
									? 'number'
									: 'punctuation'
			});

			cursor = index + text.length;
		}

		if (cursor < json.length) {
			tokens.push({ text: json.slice(cursor), kind: 'punctuation' });
		}

		return tokens;
	}

	const card = defineBlock({
		id: 'card',
		label: 'Card',
		description: 'Typed attributes with normalization and validation.',
		attributes: {
			title: {
				default: 'Launch Checklist',
				required: true,
				validate: isNonEmptyString
			},
			subtitle: 'Ship-ready status',
			body: {
				default: richTextDocument(
					'Editor and renderer are using the same extension set and style tokens.'
				),
				input: 'richtext',
				richText: {
					features: ['bold', 'italic', 'bulletList', 'orderedList']
				},
				validate: hasRichTextContent
			},
			featured: false,
			priority: {
				default: 3,
				validate: (value: unknown): value is number =>
					typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 5
			},
			owner: {
				default: 'platform',
				validate: isNonEmptyString
			},
			rollout: {
				default: 'staged',
				validate: isNonEmptyString
			},
			tags: {
				default: 'typed attrs\nversioned docs',
				input: 'textarea'
			}
		},
		component: Card
	});

	const callout = defineBlock({
		id: 'callout',
		label: 'Callout',
		description: 'Tone-tinted notice with a validated variant and rich text body.',
		attributes: {
			tone: {
				default: 'info',
				options: [
					{ value: 'info', label: 'Info' },
					{ value: 'success', label: 'Success' },
					{ value: 'warning', label: 'Warning' },
					{ value: 'danger', label: 'Danger' }
				]
			},
			title: {
				default: 'Heads up',
				required: true,
				validate: isNonEmptyString
			},
			body: {
				default: richTextDocument(
					'Callouts share the same rich text stack as the rest of the document — bold, italic and links all work.'
				),
				input: 'richtext',
				richText: {
					features: ['bold', 'italic', 'link']
				},
				validate: hasRichTextContent
			},
			showIcon: true
		},
		component: Callout
	});

	const row = defineBlock({
		id: 'row',
		label: 'Row',
		description: 'Lay out any other blocks side by side.',
		attributes: {},
		component: RowView,
		content: { kind: 'flow' }
	});

	const blocks = createBlockRegistry([card, callout, row]);
	const schema = createSchema(blocks);

	const initialDocument: DemoDocument = {
		type: 'doc',
		version: 0,
		content: [
			{
				type: 'paragraph',
				content: [
					{
						type: 'text',
						text: 'Edit this document and use the toolbar to insert or configure blocks.'
					}
				]
			},
			{
				type: 'paragraph',
				content: [
					{
						type: 'text',
						text: 'Plain rich text now lives directly in the document beside custom container blocks.'
					}
				]
			},
			{
				type: 'row',
				attrs: {},
				content: [
					{
						type: 'card',
						attrs: {
							title: 'Launch Checklist',
							subtitle: 'Ready for review',
							body: richTextDocument(
								'Use block attributes to update this card directly in the editor sidebar.'
							),
							featured: true,
							priority: 2,
							owner: 'platform',
							rollout: 'staged',
							tags: 'editor\nblocks'
						}
					},
					{
						type: 'card',
						attrs: {
							title: 'Docs refresh',
							subtitle: 'In progress',
							body: richTextDocument(
								'Screens, API notes and the block cookbook are getting a pass this week.'
							),
							featured: false,
							priority: 3,
							owner: 'writing',
							rollout: 'preview',
							tags: 'docs\nguide'
						}
					}
				]
			},
			{
				type: 'callout',
				attrs: {
					tone: 'success',
					title: 'Schema-backed authoring',
					body: richTextDocument(
						'Every edit is validated against the current schema version before it lands in the document.'
					),
					showIcon: true
				}
			},
			{
				type: 'callout',
				attrs: {
					tone: 'warning',
					title: 'Try the tone attribute',
					body: richTextDocument(
						'Select this block and pick a different tone from the sidebar — the dropdown is generated from the attribute spec.'
					),
					showIcon: true
				}
			}
		]
	};

	const attributesController = createBlockAttributesController();
	let document = $state(initialDocument);
	let activeTab = $state<'editor' | 'rendered' | 'json'>('editor');
	let formattedJson = $derived(JSON.stringify(document, null, 2));
	let highlightedJson = $derived(highlightJson(formattedJson));
</script>

<main class="min-h-dvh px-4 py-6 sm:px-6 lg:px-8">
	<section class="mx-auto max-w-360">
		<div class="mb-8">
			<h1 class="max-w-4xl">
				<span class="block text-sm font-bold uppercase tracking-[0.32em] text-primary sm:text-base">
					Uncial
				</span>
				<span class="mt-3 block text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
					Build pages from JSON. Edit them like pages.
				</span>
			</h1>
			<p class="mt-5 max-w-2xl text-lg leading-8 opacity-70">
				Uncial keeps authoring and rendering bound to the same plain JSON document, so you can load
				and save content through any API without coupling your blocks to a backend.
			</p>
		</div>

		<div>
			<div class="tabs tabs-box mb-6 w-fit" role="tablist" aria-label="Demo views">
				<button
					type="button"
					role="tab"
					class={['tab gap-2', activeTab === 'editor' && 'tab-active']}
					aria-selected={activeTab === 'editor'}
					onclick={() => (activeTab = 'editor')}
				>
					<PencilSimpleIcon size={14} weight="bold" />
					Editor
				</button>
				<button
					type="button"
					role="tab"
					class={['tab gap-2', activeTab === 'rendered' && 'tab-active']}
					aria-selected={activeTab === 'rendered'}
					onclick={() => (activeTab = 'rendered')}
				>
					<EyeIcon size={14} weight="bold" />
					Rendered
				</button>
				<button
					type="button"
					role="tab"
					class={['tab gap-2', activeTab === 'json' && 'tab-active']}
					aria-selected={activeTab === 'json'}
					onclick={() => (activeTab = 'json')}
				>
					<BracketsCurlyIcon size={14} weight="bold" />
					JSON
				</button>
			</div>

			{#if activeTab === 'editor'}
				<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
					<section aria-label="Editor">
						<Editor {blocks} {schema} {attributesController} bind:json={document} />
					</section>
					<aside
						aria-label="Block attributes"
						class="card bg-base-100 shadow-sm lg:sticky lg:top-6 lg:self-start"
					>
						<div class="card-body p-4 sm:p-6">
							<BlockAttributesPanel controller={attributesController} {blocks} />
						</div>
					</aside>
				</div>
			{:else if activeTab === 'rendered'}
				<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
					<section aria-label="Rendered" class="card bg-base-100 shadow-sm">
						<div class="card-body gap-4 p-4 sm:p-6">
							<header class="flex items-center justify-between gap-3">
								<div>
									<p class="text-xs font-bold uppercase tracking-[0.2em] opacity-60">Preview</p>
									<h2 class="text-2xl font-bold">Rendered output</h2>
								</div>
								<span class="badge badge-success badge-soft">Same document</span>
							</header>
							<Renderer {blocks} {schema} content={document} />
						</div>
					</section>
					<div class="hidden lg:block" aria-hidden="true"></div>
				</div>
			{:else}
				<section aria-label="JSON document" class="grid gap-4">
					<header class="flex items-center justify-between gap-3">
						<div>
							<p class="text-xs font-bold uppercase tracking-[0.2em] opacity-60">Document</p>
							<h2 class="text-2xl font-bold">Formatted JSON</h2>
						</div>
						<span class="badge badge-info badge-soft">Live data</span>
					</header>
					<div class="mockup-code max-h-[70dvh] overflow-auto text-sm leading-6 shadow-sm">
						<pre><code
								>{#each highlightedJson as token, index (index)}<span
										class={`json-token-${token.kind}`}>{token.text}</span
									>{/each}</code
							></pre>
					</div>
				</section>
			{/if}
		</div>
	</section>
</main>

<style>
	.json-token-key {
		color: oklch(86% 0.127 207.078);
	}

	.json-token-string {
		color: oklch(84% 0.143 164.978);
	}

	.json-token-number,
	.json-token-boolean,
	.json-token-null {
		color: oklch(85% 0.199 91.936);
	}

	.json-token-punctuation {
		color: oklch(92% 0.013 255.508);
	}
</style>
