<script module lang="ts">
	import { defineBlock } from '$lib/index.js';
	import { hasRichTextContent, richTextDocument } from '$lib/shared/richText.js';

	export const block = defineBlock({
		id: 'card',
		label: 'Card',
		description: 'Typed attributes with normalization and validation.',
		attributes: {
			title: {
				default: 'Launch checklist',
				required: true,
				validate: (value: unknown) => typeof value === 'string' && value.trim().length > 0
			},
			subtitle: 'A compact Svelte block',
			body: {
				default: richTextDocument(
					'Use rich text for the part authors should edit, and typed attributes for the parts your component owns.'
				),
				input: 'richtext',
				richText: { features: ['bold', 'italic', 'bulletList', 'orderedList'] },
				validate: hasRichTextContent
			}
		}
	});
</script>

<script lang="ts">
	import { RichText, type BlockProps } from '$lib/index.js';

	let { title, subtitle, body }: BlockProps<typeof block> = $props();
</script>

<article
	class="relative my-2 flex h-full flex-col border border-base-content/20 bg-base-100/95 p-5 shadow-[0_18px_45px_-35px_rgba(60,30,0,0.45)] transition-colors sm:p-6"
>
	<header class="space-y-2">
		<p class="font-vellum-mono text-[0.58rem] uppercase tracking-[0.28em] text-primary/80">
			Editor's Note
		</p>
		<h3
			class="font-vellum-display text-xl font-bold leading-[1.15] tracking-tight sm:text-[1.4rem]"
		>
			{title || 'Untitled dispatch'}
		</h3>
		{#if subtitle}
			<p class="font-vellum-display text-sm italic leading-snug opacity-70">
				{subtitle}
			</p>
		{/if}
	</header>

	{#if hasRichTextContent(body)}
		<div
			class="uncial-card-richtext mt-4 border-t border-base-content/10 pt-4 text-[0.95rem] leading-[1.65] opacity-90"
		>
			<RichText content={body} features={['bold', 'italic', 'bulletList', 'orderedList']} />
		</div>
	{/if}
</article>
