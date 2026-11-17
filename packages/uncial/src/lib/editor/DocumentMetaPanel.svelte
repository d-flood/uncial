<script lang="ts">
	import { parseMetaDraftValues } from '../core/meta.js';
	import type { AttributeInputs, AttributeSpec } from '../core/types.js';
	import type { ImagePreviews } from '../shared/imagePreviews.js';
	import AttributeFieldControl from './AttributeFieldControl.svelte';
	import type { FileSource } from './fileSource.js';
	import type { ImageSource } from './imageSource.js';
	import type { DocumentMetaController, DocumentMetaState } from './metaController.js';

	interface Props {
		controller: DocumentMetaController;
		fields?: ReadonlyMap<string, AttributeSpec<unknown>>;
		onCommit?: (meta: Record<string, unknown>) => void;
		attributeInputs?: AttributeInputs;
		imageSource?: ImageSource;
		imagePreviews?: ImagePreviews;
		fileSource?: FileSource;
	}

	let {
		controller,
		fields = new Map(),
		onCommit,
		attributeInputs,
		imageSource,
		imagePreviews,
		fileSource
	}: Props = $props();

	let controllerState = $state<DocumentMetaState>({
		draft: {},
		errors: {},
		dirty: false
	});
	const fieldEntries = $derived.by(() => {
		const meta = parseMetaDraftValues(fields, controllerState.draft);
		return Array.from(fields.entries()).filter(([, spec]) => spec.when?.(meta) ?? true);
	});

	function commitMeta(): void {
		const result = controller.commit();
		if (result.validation.ok) {
			onCommit?.(result.meta);
		}
	}

	$effect(() => {
		controller.setMetaFields(fields);
	});

	$effect(() => {
		const unsubscribe = controller.subscribe((state) => {
			controllerState = state;
		});

		return unsubscribe;
	});
</script>

<div class="uncial-attrs-panel uncial-meta-panel">
	<p class="uncial-attrs-title">Document metadata</p>
	{#each fieldEntries as [name, spec] (name)}
		<AttributeFieldControl
			{name}
			{spec}
			value={controllerState.draft[name]}
			error={controllerState.errors[name]}
			errors={controllerState.errors}
			onChange={(value) => controller.setDraft(name, value)}
			{attributeInputs}
			{imageSource}
			{imagePreviews}
			{fileSource}
		/>
	{:else}
		<p class="uncial-help-text">No metadata fields configured.</p>
	{/each}
	{#if fieldEntries.length > 0}
		<div class="uncial-panel__actions">
			<button
				type="button"
				class="uncial-btn uncial-btn--outline uncial-btn--sm"
				disabled={!controllerState.dirty}
				onclick={() => controller.reset()}
			>
				Reset
			</button>
			<button
				type="button"
				class="uncial-btn uncial-btn--primary uncial-btn--sm"
				onclick={commitMeta}
			>
				Save Metadata
			</button>
		</div>
	{/if}
</div>
