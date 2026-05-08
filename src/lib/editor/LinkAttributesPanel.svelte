<script lang="ts">
	import XIcon from 'phosphor-svelte/lib/XIcon';

	interface LinkAttributes {
		href?: string | null;
		target?: string | null;
		rel?: string | null;
		title?: string | null;
		class?: string | null;
	}

	interface Props {
		attrs?: LinkAttributes;
		onChange: (name: keyof LinkAttributes, value: string | null) => void;
		onApply: () => void;
		onRemove: () => void;
		onClose: () => void;
	}

	let { attrs = {}, onChange, onApply, onRemove, onClose }: Props = $props();

	const href = $derived(typeof attrs.href === 'string' ? attrs.href : '');
	const title = $derived(typeof attrs.title === 'string' ? attrs.title : '');
	const className = $derived(typeof attrs.class === 'string' ? attrs.class : '');
	const openInNewTab = $derived(attrs.target === '_blank');
</script>

<form
	class="grid gap-3"
	onsubmit={(event) => {
		event.preventDefault();
		onApply();
	}}
>
	<div class="flex items-start justify-between gap-3">
		<div>
			<p class="text-sm font-bold">Edit link</p>
			<p class="text-xs opacity-60">Configure the selected link mark.</p>
		</div>
		<button type="button" class="btn btn-ghost btn-xs btn-square" aria-label="Close link editor" onclick={onClose}>
			<XIcon size={12} weight="bold" />
		</button>
	</div>

	<label class="form-control grid gap-1">
		<span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">URL</span>
		<input
			class="input input-bordered input-sm"
			type="url"
			value={href}
			placeholder="https://example.com"
			oninput={(event) => onChange('href', event.currentTarget.value)}
		/>
	</label>

	<label class="form-control grid gap-1">
		<span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">Title</span>
		<input
			class="input input-bordered input-sm"
			type="text"
			value={title}
			placeholder="Optional title"
			oninput={(event) => onChange('title', event.currentTarget.value)}
		/>
	</label>

	<label class="form-control grid gap-1">
		<span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70">Class</span>
		<input
			class="input input-bordered input-sm"
			type="text"
			value={className}
			placeholder="Optional CSS class"
			oninput={(event) => onChange('class', event.currentTarget.value)}
		/>
	</label>

	<label class="flex items-center gap-2 text-sm">
		<input
			class="checkbox checkbox-sm"
			type="checkbox"
			checked={openInNewTab}
			onchange={(event) => {
				const target = event.currentTarget as HTMLInputElement;
				onChange('target', target.checked ? '_blank' : null);
				onChange('rel', target.checked ? 'noopener noreferrer' : null);
			}}
		/>
		<span>Open in a new tab</span>
	</label>

	<div class="flex flex-wrap justify-between gap-2 border-t border-base-300 pt-3">
		<button type="button" class="btn btn-error btn-outline btn-sm" onclick={onRemove}>Remove Link</button>
		<button type="submit" class="btn btn-primary btn-sm" disabled={!href.trim()}>Update Link</button>
	</div>
</form>
