<script lang="ts">
	import { inferAttributeInputKind, normalizeAttributeOptions } from '../core/attributes.js';
	import type { AttributeSpec } from '../core/types.js';
	import RichTextAttributeEditor from './RichTextAttributeEditor.svelte';

	interface Props {
		name: string;
		spec: AttributeSpec<unknown>;
		value?: unknown;
		error?: string;
		onChange: (value: unknown) => void;
		onCustom?: (name: string, inputKind: string) => void;
	}

	let { name, spec, value = undefined, error = '', onChange, onCustom }: Props = $props();

	const inputKind = $derived(inferAttributeInputKind(spec));
	const options = $derived(normalizeAttributeOptions(spec) ?? []);
	const stringValue = $derived.by(() => {
		if (typeof value === 'string') return value;
		if (value === undefined || value === null) return '';
		return String(value);
	});
	const customLabel = $derived(value ? `Change ${name}: ${value}` : `Choose ${name}`);
	// A stored value outside the declared options (e.g. a legacy value from before the
	// options list changed) must stay visible and re-selectable instead of being silently
	// remapped to the first option on the next commit.
	const selectOptions = $derived.by(() => {
		if (stringValue === '') return options;
		if (options.some((option) => String(option.value) === stringValue)) return options;
		return [{ value: stringValue, label: `${stringValue} (current)` }, ...options];
	});

	function isBuiltInInputKind(kind: string): boolean {
		return ['checkbox', 'number', 'richtext', 'select', 'textarea', 'json', 'text', 'hidden'].includes(
			kind
		);
	}
</script>

{#if inputKind !== 'hidden'}
	<div class="uncial-field">
		<span class="uncial-field__label">{name}</span>
		{#if !isBuiltInInputKind(inputKind)}
			<button
				type="button"
				class="uncial-btn uncial-btn--outline uncial-btn--sm uncial-btn--start"
				onclick={() => onCustom?.(name, inputKind)}
			>
				{customLabel}
			</button>
		{:else if inputKind === 'checkbox'}
			<input
				class="uncial-checkbox uncial-checkbox--sm"
				type="checkbox"
				checked={Boolean(value)}
				onchange={(event) => {
					const target = event.currentTarget as HTMLInputElement;
					onChange(target.checked);
				}}
			/>
		{:else if inputKind === 'number'}
			<input
				class="uncial-input uncial-input--sm"
				type="number"
				placeholder={spec.placeholder ?? name}
				value={value ?? ''}
				oninput={(event) => {
					const target = event.currentTarget as HTMLInputElement;
					onChange(target.value === '' ? '' : target.valueAsNumber);
				}}
			/>
		{:else if inputKind === 'richtext'}
			<RichTextAttributeEditor
				{value}
				features={spec.richText?.features}
				placeholder={spec.richText?.placeholder ?? spec.placeholder ?? name}
				{onChange}
			/>
		{:else if inputKind === 'select'}
			<select
				class="uncial-select uncial-select--sm"
				aria-label={name}
				value={stringValue}
				onchange={(event) => {
					const target = event.currentTarget as HTMLSelectElement;
					onChange(target.value);
				}}
			>
				{#each selectOptions as option (String(option.value))}
					<option value={String(option.value)}>{option.label ?? String(option.value)}</option>
				{/each}
			</select>
		{:else if inputKind === 'textarea' || inputKind === 'json'}
			<textarea
				class="uncial-textarea uncial-textarea--tall"
				placeholder={spec.placeholder ?? name}
				spellcheck={inputKind !== 'json'}
				value={stringValue}
				oninput={(event) => {
					const target = event.currentTarget as HTMLTextAreaElement;
					onChange(target.value);
				}}
			></textarea>
		{:else}
			<input
				class="uncial-input uncial-input--sm"
				type="text"
				placeholder={spec.placeholder ?? name}
				value={stringValue}
				oninput={(event) => {
					const target = event.currentTarget as HTMLInputElement;
					onChange(target.value);
				}}
			/>
		{/if}
		{#if error}
			<span class="uncial-field__error">{error}</span>
		{/if}
	</div>
{/if}
