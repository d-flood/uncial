<script module lang="ts">
	import { defineBlock } from '$lib/index.js';
	import { hasRichTextContent, richTextDocument } from '$lib/shared/richText.js';

	export const block = defineBlock({
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
				validate: (value: unknown) => typeof value === 'string' && value.trim().length > 0
			},
			body: {
				default: richTextDocument(
					'Callouts share the same rich text stack — bold and italic both work.'
				),
				input: 'richtext',
				richText: { features: ['bold', 'italic'] },
				validate: hasRichTextContent
			},
			showIcon: true
		}
	});
</script>

<script lang="ts">
	import { RichText, type BlockProps } from '$lib/index.js';

	type Tone = 'info' | 'success' | 'warning' | 'danger';

	let { tone, title, body, showIcon }: BlockProps<typeof block> = $props();

	const toneKey: Tone = $derived(
		tone === 'success' || tone === 'warning' || tone === 'danger' ? tone : 'info'
	);

	const toneLabel = $derived(
		{
			info: 'Info',
			success: 'Success!',
			warning: 'Warning',
			danger: 'Danger!'
		}[toneKey]
	);

	// Ornamental mark per tone — all typographic, no icon chrome.
	const toneGlyph = $derived({ info: '§', success: '❦', warning: '⚠', danger: '❢' }[toneKey]);

	// Map tones onto Vellum theme tokens — mostly `accent` / `secondary` /
	// `warning` / `error` so the newsprint stays calm.
	const toneText = $derived(
		{
			info: 'text-accent',
			success: 'text-secondary',
			warning: 'text-warning',
			danger: 'text-error'
		}[toneKey]
	);

	const toneRail = $derived(
		{
			info: 'bg-accent',
			success: 'bg-secondary',
			warning: 'bg-warning',
			danger: 'bg-error'
		}[toneKey]
	);

	const toneTint = $derived(
		{
			info: 'bg-accent/[0.06]',
			success: 'bg-secondary/[0.06]',
			warning: 'bg-warning/[0.08]',
			danger: 'bg-error/[0.06]'
		}[toneKey]
	);
</script>

<aside
	role="note"
	aria-label={`${toneLabel} — ${title || 'note'}`}
	class={['relative overflow-hidden border border-base-content/25 my-2', toneTint]}
>
	<!-- Accent rail -->
	<span class={['absolute inset-y-0 left-0 w-0.75', toneRail]} aria-hidden="true"></span>

	<div class="px-5 py-4 pl-6 sm:px-6 sm:pl-8">
		<!-- Dateline -->
		<header class="flex items-center justify-between gap-3 border-b border-current/20 pb-2">
			<p
				class={[
					'font-vellum-mono flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.3em]',
					toneText
				]}
			>
				{#if showIcon}
					<span class="font-vellum-display text-lg leading-none" aria-hidden="true"
						>{toneGlyph}</span
					>
				{/if}
				<span>{toneLabel}</span>
			</p>
		</header>

		<!-- Headline -->
		<h3
			class="font-vellum-display mt-3 text-xl font-bold leading-[1.15] tracking-tight sm:text-[1.35rem]"
		>
			{title || 'Untitled notice'}
		</h3>

		<!-- Body -->
		{#if hasRichTextContent(body)}
			<div class="uncial-callout-richtext mt-2 text-[0.95rem] leading-[1.7] opacity-90">
				<RichText content={body} features={['bold', 'italic']} />
			</div>
		{/if}
	</div>
</aside>
