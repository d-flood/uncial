<script module lang="ts">
	import { defineBlock } from 'uncial';

	export const block = defineBlock({
		id: 'callout',
		label: 'Callout',
		description: 'A note, warning, or tip admonition with a rich-text body.',
		attributes: {
			variant: {
				default: 'note',
				options: [
					{ value: 'note', label: 'Note' },
					{ value: 'warning', label: 'Warning' },
					{ value: 'tip', label: 'Tip' }
				]
			}
		},
		content: { kind: 'flow' }
	});
</script>

<script lang="ts">
	import type { BlockProps } from 'uncial';

	type Variant = 'note' | 'warning' | 'tip';

	let { variant, children }: BlockProps<typeof block> = $props();

	const key: Variant = $derived(variant === 'warning' || variant === 'tip' ? variant : 'note');

	const label = $derived({ note: 'Note', warning: 'Warning', tip: 'Tip' }[key]);
	const glyph = $derived({ note: '§', warning: '⚠', tip: '❦' }[key]);

	// Map each variant onto a daisyUI/Vellum semantic token.
	const railClass = $derived({ note: 'bg-info', warning: 'bg-warning', tip: 'bg-success' }[key]);
	const textClass = $derived(
		{ note: 'text-info', warning: 'text-warning', tip: 'text-success' }[key]
	);
	const tintClass = $derived(
		{ note: 'bg-info/[0.06]', warning: 'bg-warning/[0.08]', tip: 'bg-success/[0.06]' }[key]
	);
</script>

<aside
	role="note"
	aria-label={label}
	data-variant={key}
	class={['uncial-callout relative overflow-hidden border border-base-content/25 my-2', tintClass]}
>
	<span class={['absolute inset-y-0 left-0 w-0.75', railClass]} aria-hidden="true"></span>

	<div class="px-5 py-4 pl-6 sm:px-6 sm:pl-8">
		<p
			class={[
				'flex items-center gap-2 text-[0.6rem] font-bold uppercase tracking-[0.3em]',
				textClass
			]}
		>
			<span class="text-lg leading-none" aria-hidden="true">{glyph}</span>
			<span>{label}</span>
		</p>

		<div class="uncial-callout-body mt-2 text-[0.95rem] leading-[1.7] opacity-90">
			{@render children?.()}
		</div>
	</div>
</aside>
