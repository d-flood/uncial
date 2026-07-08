<script lang="ts">
	import { RichText, hasRichTextContent } from 'uncial';

	type Tone = 'info' | 'success' | 'warning' | 'danger';

	interface Props {
		tone?: string;
		title?: string;
		body?: unknown;
		showIcon?: boolean;
	}

	let { tone = 'info', title = '', body = undefined, showIcon = true }: Props = $props();

	const toneKey: Tone = $derived(
		tone === 'success' || tone === 'warning' || tone === 'danger' ? tone : 'info'
	);
	const toneLabel = $derived(
		({ info: 'Info', success: 'Success', warning: 'Warning', danger: 'Danger' })[toneKey]
	);
	const toneGlyph = $derived(({ info: 'i', success: '✓', warning: '!', danger: '!' })[toneKey]);
</script>

<aside class={["uncial-wagtail-callout", `uncial-wagtail-callout--${toneKey}`]} role="note">
	{#if showIcon}
		<span class="uncial-wagtail-callout__glyph" aria-hidden="true">{toneGlyph}</span>
	{/if}
	<div>
		<p class="uncial-wagtail-callout__tone">{toneLabel}</p>
		<h3>{title || 'Untitled callout'}</h3>
		{#if hasRichTextContent(body)}
			<div class="uncial-wagtail-callout__body">
				<RichText content={body} features={['bold', 'italic']} />
			</div>
		{/if}
	</div>
</aside>

<style>
	.uncial-wagtail-callout {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 1rem;
		margin: 1rem 0;
		border: 1px solid var(--uncial-color-border);
		border-left: 0.35rem solid var(--callout-accent, var(--uncial-color-primary));
		border-radius: var(--uncial-radius-lg);
		background: color-mix(in srgb, var(--callout-accent, var(--uncial-color-primary)) 7%, var(--uncial-color-surface));
		padding: 1rem;
	}

	.uncial-wagtail-callout--success {
		--callout-accent: #157f3b;
	}

	.uncial-wagtail-callout--warning {
		--callout-accent: #b35c00;
	}

	.uncial-wagtail-callout--danger {
		--callout-accent: var(--uncial-color-danger);
	}

	.uncial-wagtail-callout__glyph {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 999px;
		background: var(--callout-accent, var(--uncial-color-primary));
		color: var(--uncial-color-primary-contrast);
		font-weight: 700;
		line-height: 1;
	}

	.uncial-wagtail-callout__tone {
		margin: 0 0 0.25rem;
		color: var(--callout-accent, var(--uncial-color-primary));
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	h3 {
		margin: 0;
		font-size: 1.25rem;
		line-height: 1.2;
	}

	.uncial-wagtail-callout__body {
		margin-top: 0.5rem;
	}
</style>
