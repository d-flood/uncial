<script lang="ts">
	import { RichText, hasRichTextContent } from 'uncial';

	interface Props {
		title?: string;
		subtitle?: string;
		body?: unknown;
	}

	let { title = '', subtitle = '', body = undefined }: Props = $props();
</script>

<article class="uncial-wagtail-card">
	<p class="uncial-wagtail-card__eyebrow">Editor's Note</p>
	<h3>{title || 'Untitled card'}</h3>
	{#if subtitle}
		<p class="uncial-wagtail-card__subtitle">{subtitle}</p>
	{/if}
	{#if hasRichTextContent(body)}
		<div class="uncial-wagtail-card__body">
			<RichText content={body} features={['bold', 'italic', 'bulletList', 'orderedList']} />
		</div>
	{/if}
</article>

<style>
	.uncial-wagtail-card {
		display: flex;
		min-height: 100%;
		flex-direction: column;
		margin: 1rem 0;
		border: 1px solid var(--uncial-color-border);
		border-radius: var(--uncial-radius-lg);
		background: var(--uncial-color-surface);
		box-shadow: var(--uncial-shadow-sm);
		padding: 1.25rem;
	}

	.uncial-wagtail-card__eyebrow {
		margin: 0 0 0.5rem;
		color: var(--uncial-color-primary);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	h3 {
		margin: 0;
		font-size: 1.35rem;
		line-height: 1.2;
	}

	.uncial-wagtail-card__subtitle {
		margin: 0.35rem 0 0;
		color: var(--uncial-color-text-muted);
		font-style: italic;
	}

	.uncial-wagtail-card__body {
		margin-top: 1rem;
		border-top: 1px solid var(--uncial-color-border);
		padding-top: 1rem;
	}
</style>
