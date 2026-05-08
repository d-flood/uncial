<script lang="ts">
	import StarIcon from 'phosphor-svelte/lib/StarIcon';
	import UserIcon from 'phosphor-svelte/lib/UserIcon';
	import RocketIcon from 'phosphor-svelte/lib/RocketIcon';
	import { RichText, hasRichTextContent } from '../../lib/index.js';

	interface Props {
		title?: string;
		subtitle?: string;
		body?: unknown;
		featured?: boolean;
		priority?: number;
		owner?: string;
		rollout?: string;
		tags?: string;
	}

	let {
		title = '',
		subtitle = '',
		body = undefined,
		featured = false,
		priority = 0,
		owner = '',
		rollout = '',
		tags: rawTags = ''
	}: Props = $props();

	const tagList = $derived(
		String(rawTags)
			.split(/\n|,/)
			.map((tag) => tag.trim())
			.filter(Boolean)
	);
</script>

<article
	class={[
		'card bg-base-100 transition',
		featured ? 'shadow-lg ring-2 ring-warning/60' : 'border border-base-300 shadow-sm'
	]}
>
	<div class="card-body gap-3">
		<header class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<h3 class="card-title text-lg leading-tight">{title || 'Untitled card'}</h3>
				{#if subtitle}
					<p class="mt-1 text-sm opacity-70">{subtitle}</p>
				{/if}
			</div>

			<div class="flex flex-wrap justify-end gap-1.5">
				{#if featured}
					<span class="badge badge-warning gap-1">
						<StarIcon size={12} weight="fill" />
						Featured
					</span>
				{/if}
				<span class="badge badge-ghost">P{priority}</span>
			</div>
		</header>

		{#if hasRichTextContent(body)}
			<div class="uncial-card-richtext text-sm leading-6 opacity-80">
				<RichText content={body} features={['bold', 'italic', 'bulletList', 'orderedList']} />
			</div>
		{/if}

		<div class="divider my-0"></div>

		<dl class="grid grid-cols-2 gap-3 text-sm">
			<div class="flex items-start gap-2">
				<span class="mt-0.5 text-base-content/50"><UserIcon size={14} weight="bold" /></span>
				<div class="min-w-0">
					<dt class="text-[0.65rem] font-bold uppercase tracking-wider opacity-60">Owner</dt>
					<dd class="truncate font-semibold">{owner || 'Unassigned'}</dd>
				</div>
			</div>
			<div class="flex items-start gap-2">
				<span class="mt-0.5 text-base-content/50"><RocketIcon size={14} weight="bold" /></span>
				<div class="min-w-0">
					<dt class="text-[0.65rem] font-bold uppercase tracking-wider opacity-60">Rollout</dt>
					<dd class="truncate font-semibold">{rollout || 'Pending'}</dd>
				</div>
			</div>
		</dl>

		{#if tagList.length > 0}
			<div class="card-actions flex-wrap" aria-label="Card tags">
				{#each tagList as tag (tag)}
					<span class="badge badge-soft badge-info">{tag}</span>
				{/each}
			</div>
		{/if}
	</div>
</article>
