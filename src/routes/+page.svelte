<script lang="ts">
	import {
		Editor,
		Renderer,
		createBlockAttributesController,
		createBlockRegistry,
		createSchema,
		defineBlock
	} from '../lib/index.js';
	import CardGroupView from './demo/CardGroupView.svelte';
	import Card from './demo/Card.svelte';

	const card = defineBlock({
		id: 'card',
		label: 'Card',
		attributes: {
			title: 'Launch Checklist',
			subtitle: 'Ship-ready status',
			body: 'Editor and renderer are using the same extension set and style tokens.'
		},
		component: Card
	});

	const cardGroup = defineBlock({
		id: 'cardGroup',
		label: 'Card Group',
		attributes: {
			title: 'Release Readiness',
			cards:
				'Editor polish|Formatting and keyboard flow are stable.\nRenderer parity|Both views share the same card visuals.\nQA pass|Unit coverage and smoke checks completed.'
		},
		component: CardGroupView
	});

	const blocks = createBlockRegistry([card, cardGroup]);
	const schema = createSchema(blocks);
	const attributesController = createBlockAttributesController();

	let document = {
		type: 'doc',
		content: [
			{
				type: 'paragraph',
				content: [
					{
						type: 'text',
						text: 'This demo shows a real card block plus bold/italic/link marks.'
					}
				]
			},
			{
				type: 'card',
				attrs: {
					title: 'Card from JSON',
					subtitle: 'Inserted by initial document state',
					body: 'Use the toolbar popup to edit attributes before insertion.'
				}
			},
			{
				type: 'cardGroup',
				attrs: {
					title: 'Card Group Block',
					cards:
						'Design pass|Updated type, color, and spacing tokens for the demo.\nResponsive layout|Cards wrap based on available horizontal space.\nAuthoring workflow|Insert and edit from the same attributes popover.'
				}
			}
		]
	};
</script>

<main class="demo-shell">
	<header class="hero">
		<p class="eyebrow">Uncial • Client-Only Demo</p>
		<h1>Composable Blocks, Sharper UI</h1>
		<p class="hero-copy">
			The demo now includes a <strong>Card Group</strong> block with responsive wrapping cards.
			Enter one card per line in the form <code>Title|Description</code>.
		</p>
	</header>

	<div class="grid">
		<section class="panel">
			<h2>Editor</h2>
			<div class="demo-controls">
				<button type="button" on:click={() => attributesController.openAttributes('card')}>
					Insert Card
				</button>
				<button type="button" on:click={() => attributesController.openAttributes('cardGroup')}>
					Insert Card Group
				</button>
				<button
					type="button"
					disabled={$attributesController.activeBlock === null}
					on:click={() => attributesController.openAttributes()}
				>
					Edit Selected Block
				</button>
				<p class="hint">
					Choose a block, then use the attributes popover to insert or update it in place.
				</p>
			</div>
			<Editor {blocks} {schema} {attributesController} bind:json={document} />
		</section>
		<section class="panel">
			<h2>Renderer</h2>
			<Renderer content={document} {blocks} {schema} />
		</section>
	</div>

	<section class="json-panel">
		<h2>JSON</h2>
		<pre>{JSON.stringify(document, null, 2)}</pre>
	</section>
</main>

<style>
	:global(body) {
		margin: 0;
		font-family: 'Avenir Next', 'Segoe UI', sans-serif;
		background:
			radial-gradient(circle at 15% 20%, rgb(255 255 255 / 75%), transparent 40%),
			radial-gradient(circle at 90% 0%, rgb(255 210 165 / 25%), transparent 35%),
			linear-gradient(170deg, #fff7ea 0%, #fcfbff 45%, #edf6ff 100%);
		color: #1f2124;
	}

	.demo-shell {
		max-width: 1120px;
		margin: 0 auto;
		padding: 2rem 1rem 2.5rem;
	}

	.hero {
		background: rgb(255 255 255 / 82%);
		border: 1px solid rgb(255 255 255 / 85%);
		border-radius: 22px;
		padding: 1.1rem 1.3rem 1.3rem;
		backdrop-filter: blur(6px);
		box-shadow: 0 18px 36px -28px rgb(24 33 58 / 45%);
	}

	.eyebrow {
		margin: 0;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		font-weight: 700;
		font-size: 0.72rem;
		color: #5e4b2f;
	}

	h1 {
		margin: 0.5rem 0 0;
		font-family: 'Palatino Linotype', 'Book Antiqua', serif;
		font-size: clamp(1.9rem, 4vw, 2.8rem);
		line-height: 1.05;
	}

	.hero-copy {
		margin: 0.8rem 0 0;
		max-width: 68ch;
		color: #424d60;
	}

	.grid {
		margin-top: 1rem;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: 1.1rem;
	}

	.panel,
	.json-panel {
		background: rgb(255 255 255 / 82%);
		border: 1px solid rgb(255 255 255 / 90%);
		border-radius: 18px;
		padding: 1rem;
		box-shadow: 0 16px 30px -26px rgb(24 33 58 / 45%);
	}

	h2 {
		font-family: 'Palatino Linotype', 'Book Antiqua', serif;
		margin: 0 0 0.7rem;
		font-size: 1.3rem;
	}

	pre {
		margin: 0;
		background: #161a21;
		color: #e8f2ff;
		padding: 0.9rem;
		border-radius: 12px;
		overflow: auto;
		font-size: 0.84rem;
	}

	.demo-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.55rem;
		align-items: center;
		margin-bottom: 0.85rem;
	}

	.demo-controls button {
		font: 600 0.88rem/1.1 'Avenir Next', 'Segoe UI', sans-serif;
		padding: 0.45rem 0.72rem;
		border: 1px solid #d9c7ab;
		border-radius: 999px;
		background: linear-gradient(180deg, #fff7ec 0%, #fde8ce 100%);
		color: #4f3521;
		cursor: pointer;
		transition:
			transform 150ms ease,
			box-shadow 150ms ease;
	}

	.demo-controls button:hover:enabled {
		transform: translateY(-1px);
		box-shadow: 0 9px 16px -12px rgb(96 50 21 / 65%);
	}

	.demo-controls button:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}

	.hint {
		margin: 0;
		font-size: 0.87rem;
		color: #5e6a7c;
	}

	.json-panel {
		margin-top: 1.1rem;
	}

	@media (max-width: 640px) {
		.demo-shell {
			padding: 1rem 0.8rem 1.6rem;
		}

		.hero,
		.panel,
		.json-panel {
			padding: 0.9rem;
			border-radius: 14px;
		}
	}
</style>
