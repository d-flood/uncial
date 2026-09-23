<script lang="ts" module>
	// Per-instance id so each rendered field can associate its <label> with its
	// control, even when several fields share the same attribute name across
	// blocks. A module counter keeps ids unique and stable without crypto.
	let nextFieldId = 0;
</script>

<script lang="ts">
	import {
		attributeListFields,
		attributeListValueSpec,
		createAttributeListItem,
		inferAttributeInputKind,
		normalizeAttributeOptions
	} from '../core/attributes.js';
	import type { AttributeSpec } from '../core/types.js';
	import type { ImagePreviews } from '../shared/imagePreviews.js';
	import type { ImageSource } from './imageSource.js';
	import ArrowUpIcon from 'phosphor-svelte/lib/ArrowUpIcon';
	import ArrowDownIcon from 'phosphor-svelte/lib/ArrowDownIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import RichTextAttributeEditor from './RichTextAttributeEditor.svelte';
	// A list item's fields are ordinary attributes, edited by this same control.
	import AttributeFieldControl from './AttributeFieldControl.svelte';

	interface Props {
		name: string;
		spec: AttributeSpec<unknown>;
		value?: unknown;
		error?: string;
		onChange: (value: unknown) => void;
		onCustom?: (name: string, inputKind: string) => void;
		imageSource?: ImageSource;
		imagePreviews?: ImagePreviews;
	}

	let {
		name,
		spec,
		value = undefined,
		error = '',
		onChange,
		onCustom,
		imageSource,
		imagePreviews
	}: Props = $props();

	const fieldId = `uncial-field-${nextFieldId++}`;
	const inputKind = $derived(inferAttributeInputKind(spec));
	// The rich-text editor and custom choosers render a component / <button>,
	// neither of which a <label for> can address, so only native form controls
	// get an associated <label>.
	const hasLabelableControl = $derived(
		isBuiltInInputKind(inputKind) &&
			inputKind !== 'richtext' &&
			inputKind !== 'list' &&
			inputKind !== 'image'
	);
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

	const list = $derived(spec.list ?? {});
	const listFields = $derived(attributeListFields(list));
	const listValueSpec = $derived(attributeListValueSpec(list));
	const itemLabel = $derived(list.itemLabel ?? 'item');
	const items = $derived(Array.isArray(value) ? (value as unknown[]) : []);

	let fileInput = $state<HTMLInputElement>();
	let uploading = $state(false);
	let uploadError = $state('');
	// The registry is not reactive, but an upload registers its preview before
	// writing the value, so the value change is what recomputes this.
	const thumbnailSrc = $derived(
		stringValue
			? (imagePreviews?.get(stringValue) ?? imageSource?.thumbnail?.(stringValue) ?? stringValue)
			: ''
	);

	async function uploadImage(file: File, upload: (file: File) => Promise<string>): Promise<void> {
		uploading = true;
		uploadError = '';
		try {
			const src = await upload(file);
			imagePreviews?.register(src, file);
			onChange(src);
		} catch (reason) {
			uploadError = reason instanceof Error ? reason.message : String(reason);
		} finally {
			uploading = false;
		}
	}

	function isBuiltInInputKind(kind: string): boolean {
		return [
			'checkbox',
			'number',
			'richtext',
			'select',
			'textarea',
			'json',
			'list',
			'text',
			'hidden',
			'image'
		].includes(kind);
	}

	function replaceItem(index: number, next: unknown): void {
		onChange(items.map((item, position) => (position === index ? next : item)));
	}

	function setItemField(index: number, field: string, next: unknown): void {
		const item = items[index];
		replaceItem(index, { ...(item as Record<string, unknown>), [field]: next });
	}

	function moveItem(index: number, target: number): void {
		if (target < 0 || target >= items.length) return;
		const next = [...items];
		const [moved] = next.splice(index, 1);
		next.splice(target, 0, moved);
		onChange(next);
	}

	function removeItem(index: number): void {
		onChange(items.filter((_, position) => position !== index));
	}

	function addItem(): void {
		onChange([...items, createAttributeListItem(list)]);
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
		{:else if inputKind === 'list'}
			<div class="uncial-list-field">
				{#each items as item, index (index)}
					<div class="uncial-list-item">
						<div class="uncial-list-item__head">
							<span class="uncial-section-label">{itemLabel} {index + 1}</span>
							<div class="uncial-child-item__actions">
								<button
									type="button"
									class="uncial-btn uncial-btn--ghost uncial-btn--xs uncial-btn--square"
									aria-label={`Move ${itemLabel} up`}
									disabled={index === 0}
									onclick={() => moveItem(index, index - 1)}
								>
									<ArrowUpIcon size={12} weight="bold" />
								</button>
								<button
									type="button"
									class="uncial-btn uncial-btn--ghost uncial-btn--xs uncial-btn--square"
									aria-label={`Move ${itemLabel} down`}
									disabled={index === items.length - 1}
									onclick={() => moveItem(index, index + 1)}
								>
									<ArrowDownIcon size={12} weight="bold" />
								</button>
								<button
									type="button"
									class="uncial-btn uncial-btn--ghost uncial-btn--danger uncial-btn--xs uncial-btn--square"
									aria-label={`Remove ${itemLabel}`}
									onclick={() => removeItem(index)}
								>
									<TrashIcon size={12} weight="bold" />
								</button>
							</div>
						</div>
						{#if listValueSpec}
							<AttributeFieldControl
								name={itemLabel}
								spec={listValueSpec}
								value={item}
								onChange={(next) => replaceItem(index, next)}
								{onCustom}
								{imageSource}
								{imagePreviews}
							/>
						{:else}
							{#each listFields as [fieldName, fieldSpec] (fieldName)}
								<AttributeFieldControl
									name={fieldName}
									spec={fieldSpec}
									value={(item as Record<string, unknown>)?.[fieldName]}
									onChange={(next) => setItemField(index, fieldName, next)}
									{onCustom}
									{imageSource}
									{imagePreviews}
								/>
							{/each}
						{/if}
					</div>
				{:else}
					<p class="uncial-help-text">No {itemLabel}s yet.</p>
				{/each}
				<button
					type="button"
					class="uncial-btn uncial-btn--primary uncial-btn--xs uncial-btn--start"
					onclick={addItem}
				>
					<PlusIcon size={12} weight="bold" />
					<span>Add {itemLabel}</span>
				</button>
			</div>
		{:else if inputKind === 'image'}
			{@const upload = imageSource?.upload}
			<div class="uncial-image-field">
				{#if thumbnailSrc}
					<img class="uncial-image-field__thumbnail" src={thumbnailSrc} alt="" />
				{/if}
				<div class="uncial-image-field__actions">
					{#if upload}
						<input
							bind:this={fileInput}
							type="file"
							accept="image/*"
							hidden
							onchange={(event) => {
								const target = event.currentTarget as HTMLInputElement;
								const file = target.files?.[0];
								// Reset so picking the same file again still fires `change`.
								target.value = '';
								if (file) void uploadImage(file, upload);
							}}
						/>
						<button
							type="button"
							class="uncial-btn uncial-btn--outline uncial-btn--sm"
							disabled={uploading}
							onclick={() => fileInput?.click()}
						>
							Upload
						</button>
					{/if}
					{#if stringValue}
						<button
							type="button"
							class="uncial-btn uncial-btn--ghost uncial-btn--sm"
							disabled={uploading}
							onclick={() => onChange('')}
						>
							Clear
						</button>
					{/if}
				</div>
				{#if uploading}
					<span class="uncial-help-text" role="status">Uploading…</span>
				{/if}
				{#if uploadError}
					<span class="uncial-field__error" role="alert">{uploadError}</span>
				{/if}
			</div>
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
