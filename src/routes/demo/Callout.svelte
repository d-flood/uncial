<script lang="ts">
	import InfoIcon from 'phosphor-svelte/lib/InfoIcon';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
	import WarningOctagonIcon from 'phosphor-svelte/lib/WarningOctagonIcon';
	import { RichText, hasRichTextContent } from '../../lib/index.js';

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
		toneKey === 'success'
			? 'Success'
			: toneKey === 'warning'
				? 'Warning'
				: toneKey === 'danger'
					? 'Danger'
					: 'Info'
	);

	const containerClasses = $derived(
		toneKey === 'success'
			? 'border-success/40 bg-success/5'
			: toneKey === 'warning'
				? 'border-warning/40 bg-warning/5'
				: toneKey === 'danger'
					? 'border-error/40 bg-error/5'
					: 'border-info/40 bg-info/5'
	);

	const accentClasses = $derived(
		toneKey === 'success'
			? 'bg-success'
			: toneKey === 'warning'
				? 'bg-warning'
				: toneKey === 'danger'
					? 'bg-error'
					: 'bg-info'
	);

	const iconBadgeClasses = $derived(
		toneKey === 'success'
			? 'bg-success/15 text-success'
			: toneKey === 'warning'
				? 'bg-warning/15 text-warning'
				: toneKey === 'danger'
					? 'bg-error/15 text-error'
					: 'bg-info/15 text-info'
	);

	const labelClasses = $derived(
		toneKey === 'success'
			? 'text-success'
			: toneKey === 'warning'
				? 'text-warning'
				: toneKey === 'danger'
					? 'text-error'
					: 'text-info'
	);
</script>

<aside
	class={['relative overflow-hidden rounded-lg border', containerClasses]}
	role="note"
	aria-label={`${toneLabel} callout`}
>
	<span class={['absolute inset-y-0 left-0 w-1', accentClasses]} aria-hidden="true"></span>
	<div class="flex items-start gap-3 p-4 pl-5">
		{#if showIcon}
			<span
				class={['flex size-8 shrink-0 items-center justify-center rounded-full', iconBadgeClasses]}
				aria-hidden="true"
			>
				{#if toneKey === 'success'}
					<CheckCircleIcon size={16} weight="bold" />
				{:else if toneKey === 'warning'}
					<WarningIcon size={16} weight="bold" />
				{:else if toneKey === 'danger'}
					<WarningOctagonIcon size={16} weight="bold" />
				{:else}
					<InfoIcon size={16} weight="bold" />
				{/if}
			</span>
		{/if}
		<div class="min-w-0 flex-1">
			<p class={['text-[0.65rem] font-bold uppercase tracking-[0.18em]', labelClasses]}>
				{toneLabel}
			</p>
			<h3 class="mt-0.5 text-base font-semibold leading-snug">
				{title || 'Untitled callout'}
			</h3>
			{#if hasRichTextContent(body)}
				<div class="uncial-callout-richtext mt-2 text-sm leading-6 opacity-80">
					<RichText content={body} features={['bold', 'italic', 'link']} />
				</div>
			{/if}
		</div>
	</div>
</aside>
