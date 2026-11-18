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
		isBuiltInInputKind,
		missingAlt,
		normalizeAttributeOptions
	} from '../core/attributes.js';
	import { onDestroy } from 'svelte';
	import { isPlainObject } from '../shared/guards.js';
	import type {
		AttributeInputs,
		AttributeSpec,
		FileValue,
		FocalPoint,
		ImageChooser,
		ImageValue
	} from '../core/types.js';
	import type { ImagePreviews } from '../shared/imagePreviews.js';
	import type { FileSource } from './fileSource.js';
	import type { ImageSource } from './imageSource.js';
	import FileActions from './FileActions.svelte';
	import FocalPointPicker from './FocalPointPicker.svelte';
	import ArrowUpIcon from 'phosphor-svelte/lib/ArrowUpIcon';
	import ArrowDownIcon from 'phosphor-svelte/lib/ArrowDownIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import ImageChooserDialog from './ImageChooserDialog.svelte';
	import ImagePicker from './ImagePicker.svelte';
	import { fromWallClock, toWallClock } from './zonedDateTime.js';
	import RichTextAttributeEditor from './RichTextAttributeEditor.svelte';
	// A list item's fields are ordinary attributes, edited by this same control.
	import AttributeFieldControl from './AttributeFieldControl.svelte';

	interface Props {
		name: string;
		spec: AttributeSpec<unknown>;
		value?: unknown;
		error?: string;
		path?: string;
		errors?: Record<string, string>;
		onChange: (value: unknown) => void;
		/** Components that edit host-defined input kinds; a kind without one renders no field. */
		attributeInputs?: AttributeInputs;
		imageSource?: ImageSource;
		imagePreviews?: ImagePreviews;
		/** The Content model's Image choosers, offered by image fields that name them. */
		imageChoosers?: Record<string, ImageChooser>;
		fileSource?: FileSource;
	}

	let {
		name,
		spec,
		value = undefined,
		error = '',
		path,
		errors = {},
		onChange,
		attributeInputs,
		imageSource,
		imagePreviews,
		imageChoosers,
		fileSource
	}: Props = $props();

	const fieldId = `uncial-field-${nextFieldId++}`;
	const inputKind = $derived(inferAttributeInputKind(spec));
	// The rich-text editor and host inputs render a component,
	// neither of which a <label for> can address, so only native form controls
	// get an associated <label>.
	const hasLabelableControl = $derived(
		isBuiltInInputKind(inputKind) &&
			inputKind !== 'richtext' &&
			inputKind !== 'list' &&
			inputKind !== 'image' &&
			inputKind !== 'file'
	);
	const options = $derived(normalizeAttributeOptions(spec) ?? []);
	const warning = $derived(spec.warn?.(value) ?? '');
	const stringValue = $derived.by(() => {
		if (typeof value === 'string') return value;
		if (value === undefined || value === null) return '';
		return String(value);
	});
	const CustomInput = $derived(
		isBuiltInInputKind(inputKind) ? undefined : attributeInputs?.[inputKind]
	);
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
	const fieldPath = $derived(path ?? name);

	let fileInput = $state<HTMLInputElement>();
	let picker = $state<ImagePicker>();
	let chooserDialog = $state<ImageChooserDialog>();
	let uploading = $state(false);
	let uploadError = $state('');
	// An image attribute whose default is not a string stores `{ src, focal? }`.
	const imageObject = $derived(typeof spec.default !== 'string');
	const imageValue = $derived(
		imageObject && value !== null && typeof value === 'object' ? (value as ImageValue) : null
	);
	const imageSrc = $derived(imageObject ? (imageValue?.src ?? '') : stringValue);
	const offersMedia = $derived(spec.image?.media !== false);
	const storesAlt = $derived(imageObject && spec.image?.alt !== false);
	const altMissing = $derived(missingAlt(spec, value));
	const choosers = $derived(
		(spec.image?.choosers ?? []).flatMap((id) => imageChoosers?.[id] ?? [])
	);
	// A chosen value may have no src, so the chooser that stored it names its thumbnail.
	let chosenThumbnail = $state<string>();
	$effect(() => {
		const chosen = imageValue && !imageSrc ? { ...imageValue } : null;
		if (!chosen) {
			chosenThumbnail = undefined;
			return;
		}
		let live = true;
		const thumbnailOf = async (chooser: ImageChooser) => chooser.thumbnail?.(chosen);
		void Promise.all(choosers.map((chooser) => thumbnailOf(chooser).catch(() => undefined))).then(
			(urls) => {
				if (live) chosenThumbnail = urls.find(Boolean);
			}
		);
		return () => (live = false);
	});
	const fileValue = $derived(
		value !== null && typeof value === 'object' ? (value as FileValue) : null
	);
	// The registry is not reactive, but an upload registers its preview before
	// writing the value, so the value change is what recomputes this.
	const thumbnailSrc = $derived(
		imageSrc
			? (imagePreviews?.get(imageSrc) ?? imageSource?.thumbnail?.(imageSrc) ?? imageSrc)
			: (chosenThumbnail ?? '')
	);

	// A replaced image keeps its alt text and decorative mark unless the new value brings its own.
	function keepAlt(next: unknown): unknown {
		if (!storesAlt || !imageValue || !isPlainObject(next)) return next;
		const { alt, decorative } = imageValue;
		return { ...(alt ? { alt } : {}), ...(decorative ? { decorative } : {}), ...next };
	}

	function setImageSrc(src: string): void {
		if (!imageObject) return onChange(src);
		onChange(src ? keepAlt({ src }) : null);
	}

	function setAlt(alt: string): void {
		if (!imageValue) return;
		const next: ImageValue = { ...imageValue, alt };
		if (!alt) delete next.alt;
		onChange(next);
	}

	function setDecorative(decorative: boolean): void {
		if (!imageValue) return;
		const next: ImageValue = { ...imageValue, decorative };
		if (!decorative) delete next.decorative;
		onChange(next);
	}

	function setFocal(focal: FocalPoint | undefined): void {
		if (!imageValue) return;
		const next: ImageValue = { ...imageValue, focal };
		if (!focal) delete next.focal;
		onChange(next);
	}

	function formatBytes(size: number): string {
		if (size < 1024) return `${size} B`;
		if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
		return `${(size / (1024 * 1024)).toFixed(1)} MB`;
	}

	// The panel remounts its controls when another block is selected, so an
	// upload resolving after that would write into the wrong block. Its value is
	// dropped instead; the preview is still registered so the committed file is
	// usable through Choose existing before it is deployed.
	let destroyed = false;
	onDestroy(() => (destroyed = true));

	async function uploadImage(file: File, upload: (file: File) => Promise<string>): Promise<void> {
		uploading = true;
		uploadError = '';
		try {
			const src = await upload(file);
			imagePreviews?.register(src, file);
			if (destroyed) return;
			setImageSrc(src);
		} catch (reason) {
			uploadError = reason instanceof Error ? reason.message : String(reason);
		} finally {
			uploading = false;
		}
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

{#if inputKind !== 'hidden' && (isBuiltInInputKind(inputKind) || CustomInput)}
	<div class="uncial-field">
		{#if hasLabelableControl}
			<label class="uncial-field__label" for={fieldId}>{name}</label>
		{:else}
			<span class="uncial-field__label">{name}</span>
		{/if}
		{#if CustomInput}
			<CustomInput {name} {spec} {value} update={onChange} />
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
		{:else if inputKind === 'date'}
			<input
				id={fieldId}
				class="uncial-input uncial-input--sm"
				type="date"
				value={stringValue}
				onchange={(event) => {
					const target = event.currentTarget as HTMLInputElement;
					onChange(target.value);
				}}
			/>
		{:else if inputKind === 'datetime'}
			<input
				id={fieldId}
				class="uncial-input uncial-input--sm"
				type="datetime-local"
				value={toWallClock(stringValue, spec.timeZone)}
				onchange={(event) => {
					const target = event.currentTarget as HTMLInputElement;
					onChange(fromWallClock(target.value, spec.timeZone));
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
					{@const itemPath = `${fieldPath}.${index}`}
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
									<ArrowUpIcon size={12} weight="bold" aria-hidden="true" />
								</button>
								<button
									type="button"
									class="uncial-btn uncial-btn--ghost uncial-btn--xs uncial-btn--square"
									aria-label={`Move ${itemLabel} down`}
									disabled={index === items.length - 1}
									onclick={() => moveItem(index, index + 1)}
								>
									<ArrowDownIcon size={12} weight="bold" aria-hidden="true" />
								</button>
								<button
									type="button"
									class="uncial-btn uncial-btn--ghost uncial-btn--danger uncial-btn--xs uncial-btn--square"
									aria-label={`Remove ${itemLabel}`}
									onclick={() => removeItem(index)}
								>
									<TrashIcon size={12} weight="bold" aria-hidden="true" />
								</button>
							</div>
						</div>
						{#if listValueSpec}
							<AttributeFieldControl
								name={itemLabel}
								spec={listValueSpec}
								value={item}
								path={itemPath}
								error={errors[itemPath]}
								{errors}
								onChange={(next) => replaceItem(index, next)}
								{attributeInputs}
								{imageSource}
								{imagePreviews}
								{imageChoosers}
								{fileSource}
							/>
						{:else}
							{#each listFields as [fieldName, fieldSpec] (fieldName)}
								{@const subPath = `${itemPath}.${fieldName}`}
								<AttributeFieldControl
									name={fieldName}
									spec={fieldSpec}
									value={(item as Record<string, unknown>)?.[fieldName]}
									path={subPath}
									error={errors[subPath]}
									{errors}
									onChange={(next) => setItemField(index, fieldName, next)}
									{attributeInputs}
									{imageSource}
									{imagePreviews}
									{imageChoosers}
									{fileSource}
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
					<PlusIcon size={12} weight="bold" aria-hidden="true" />
					<span>Add {itemLabel}</span>
				</button>
			</div>
		{:else if inputKind === 'image'}
			{@const upload = offersMedia ? imageSource?.upload : undefined}
			{@const browse = offersMedia ? imageSource?.browse : undefined}
			<div class="uncial-image-field">
				{#if imageValue && thumbnailSrc}
					<FocalPointPicker src={thumbnailSrc} focal={imageValue.focal} onChange={setFocal} />
				{:else if thumbnailSrc}
					<img class="uncial-image-field__thumbnail" src={thumbnailSrc} alt="" />
				{/if}
				{#if storesAlt && imageValue}
					{#if !imageValue.decorative}
						<input
							class="uncial-input uncial-input--sm"
							type="text"
							aria-label="Alt text"
							aria-invalid={altMissing}
							placeholder="Alt text"
							value={imageValue.alt ?? ''}
							oninput={(event) => setAlt(event.currentTarget.value)}
						/>
					{/if}
					<label class="uncial-image-field__decorative">
						<input
							class="uncial-checkbox uncial-checkbox--sm"
							type="checkbox"
							checked={imageValue.decorative === true}
							onchange={(event) => setDecorative(event.currentTarget.checked)}
						/>
						<span>Decorative, needs no alt text</span>
					</label>
					{#if altMissing && !error}
						<span class="uncial-field__error">Add alt text, or mark the image decorative.</span>
					{/if}
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
					{#if browse}
						<button
							type="button"
							class="uncial-btn uncial-btn--outline uncial-btn--sm"
							disabled={uploading}
							onclick={() => picker?.open()}
						>
							Choose existing
						</button>
						<ImagePicker
							bind:this={picker}
							{browse}
							thumbnail={imageSource?.thumbnail}
							{imagePreviews}
							current={imageSrc}
							onPick={setImageSrc}
						/>
					{/if}
					{#each choosers as chooser (chooser)}
						<button
							type="button"
							class="uncial-btn uncial-btn--outline uncial-btn--sm"
							disabled={uploading}
							onclick={() => chooserDialog?.open(chooser)}
						>
							{chooser.label}
						</button>
					{/each}
					{#if choosers.length}
						<ImageChooserDialog
							bind:this={chooserDialog}
							{value}
							onChoose={(next) => onChange(keepAlt(next))}
						/>
					{/if}
					{#if imageSrc || imageValue}
						<button
							type="button"
							class="uncial-btn uncial-btn--ghost uncial-btn--sm"
							disabled={uploading}
							onclick={() => setImageSrc('')}
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
		{:else if inputKind === 'file'}
			<div class="uncial-image-field">
				{#if fileValue?.src}
					<span class="uncial-help-text uncial-file-field__name">
						<a
							href={fileSource?.href?.(fileValue.src) ?? fileValue.src}
							target="_blank"
							rel="noopener">{fileValue.name || fileValue.src}</a
						>{fileValue.size ? ` · ${formatBytes(fileValue.size)}` : ''}
					</span>
				{/if}
				{#if fileSource}
					<FileActions
						source={fileSource}
						current={fileValue?.src}
						onPick={(picked) => onChange(typeof spec.default === 'string' ? picked.src : picked)}
					/>
				{/if}
				{#if fileValue?.src}
					<div class="uncial-image-field__actions">
						<button
							type="button"
							class="uncial-btn uncial-btn--ghost uncial-btn--sm"
							onclick={() => onChange(null)}
						>
							Clear
						</button>
					</div>
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
		{#if warning}
			<span class="uncial-field__warning" role="status">{warning}</span>
		{/if}
		{#if error}
			<span class="uncial-field__error">{error}</span>
		{/if}
	</div>
{/if}
