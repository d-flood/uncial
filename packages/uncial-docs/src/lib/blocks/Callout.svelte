<script lang="ts">
	// Docs Callout: a note/warning/tip admonition. Its body is a flow content
	// region (rendered via `children`), so authors write ordinary rich text and
	// nested blocks inside it. Used identically by the SSR renderer (reader pages)
	// and the editor (editor variants) — one definition, both surfaces.
	import type { Snippet } from 'svelte';

	type Variant = 'note' | 'warning' | 'tip';

	interface Props {
		variant?: string;
		children?: Snippet;
	}

	let { variant = 'note', children }: Props = $props();

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
