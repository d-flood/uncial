<script lang="ts" module>
	// Per-instance id so each rendered field can associate its <label> with its
	// control, even when several fields share the same attribute name across
	// blocks. A module counter keeps ids unique and stable without crypto.
	let nextFieldId = 0;
</script>

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

	const fieldId = `uncial-field-${nextFieldId++}`;
	const inputKind = $derived(inferAttributeInputKind(spec));
	// The rich-text editor and custom choosers render a component / <button>,
	// neither of which a <label for> can address, so only native form controls
	// get an associated <label>.
	const hasLabelableControl = $derived(isBuiltInInputKind(inputKind) && inputKind !== 'richtext');
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
		{#if hasLabelableControl}
			<label class="uncial-field__label" for={fieldId}>{name}</label>
		{:else}
			<span class="uncial-field__label">{name}</span>
		{/if}
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
				id={fieldId}
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
				id={fieldId}
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
				id={fieldId}
				class="uncial-select uncial-select--sm"
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
				id={fieldId}
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
				id={fieldId}
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
