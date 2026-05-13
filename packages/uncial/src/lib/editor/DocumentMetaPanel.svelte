<script lang="ts">
	import type { AttributeSpec } from '../core/types.js';
	import AttributeFieldControl from './AttributeFieldControl.svelte';
	import type { DocumentMetaController, DocumentMetaState } from './metaController.js';

	interface Props {
		controller: DocumentMetaController;
		fields?: ReadonlyMap<string, AttributeSpec<unknown>>;
		onCommit?: (meta: Record<string, unknown>) => void;
	}

	let { controller, fields = new Map(), onCommit }: Props = $props();

	let controllerState = $state<DocumentMetaState>({
		draft: {},
		errors: {},
		dirty: false
	});
	const fieldEntries = $derived(Array.from(fields.entries()));

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
			onChange={(value) => controller.setDraft(name, value)}
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
			<button type="button" class="uncial-btn uncial-btn--primary uncial-btn--sm" onclick={commitMeta}>
				Save Metadata
			</button>
		</div>
	{/if}
</div>
