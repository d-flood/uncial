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
	class="uncial-link-panel"
	onsubmit={(event) => {
		event.preventDefault();
		onApply();
	}}
>
	<div class="uncial-link-panel__header">
		<div>
			<p class="uncial-link-panel__title">Edit link</p>
			<p class="uncial-link-panel__description">Configure the selected link mark.</p>
		</div>
		<button
			type="button"
			class="uncial-btn uncial-btn--ghost uncial-btn--xs uncial-btn--square"
			aria-label="Close link editor"
			onclick={onClose}
		>
			<XIcon size={12} weight="bold" />
		</button>
	</div>

	<label class="uncial-field">
		<span class="uncial-field__label">URL</span>
		<input
			class="uncial-input uncial-input--sm"
			type="url"
			value={href}
			placeholder="https://example.com"
			oninput={(event) => onChange('href', event.currentTarget.value)}
		/>
	</label>

	<label class="uncial-field">
		<span class="uncial-field__label">Title</span>
		<input
			class="uncial-input uncial-input--sm"
			type="text"
			value={title}
			placeholder="Optional title"
			oninput={(event) => onChange('title', event.currentTarget.value)}
		/>
	</label>

	<label class="uncial-field">
		<span class="uncial-field__label">Class</span>
		<input
			class="uncial-input uncial-input--sm"
			type="text"
			value={className}
			placeholder="Optional CSS class"
			oninput={(event) => onChange('class', event.currentTarget.value)}
		/>
	</label>

	<label class="uncial-link-panel__new-tab">
		<input
			class="uncial-checkbox uncial-checkbox--sm"
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

	<div class="uncial-link-panel__actions">
		<button
			type="button"
			class="uncial-btn uncial-btn--danger uncial-btn--outline uncial-btn--sm"
			onclick={onRemove}>Remove Link</button
		>
		<button
			type="submit"
			class="uncial-btn uncial-btn--primary uncial-btn--sm"
			disabled={!href.trim()}>Update Link</button
		>
	</div>
</form>
