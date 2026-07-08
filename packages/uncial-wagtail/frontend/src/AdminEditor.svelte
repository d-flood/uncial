<script lang="ts">
	import {
		BlockAttributesPanel,
		Editor,
		createBlockAttributesController,
		CHOOSE_ATTRIBUTE_EVENT,
		type ChooseAttributeRequest
	} from 'uncial/editor';
	import type { ToolbarFeature, ToolbarFeatureSelection } from 'uncial/editor';
	import type { BlockRegistry, ContentSchema } from 'uncial/core';
	import { chooseImageForAttribute } from './chooser.js';
	import type { ChooseAttributeEvent } from './imageBrowser.js';

	type JSONContent = Record<string, unknown>;

	interface Props {
		json?: JSONContent;
		schema?: ContentSchema;
		blocks?: BlockRegistry;
		toolbarFeatures?: ToolbarFeatureSelection;
		toolbarExtensions?: ToolbarFeature[];
		onChange?: (document: JSONContent) => void;
	}

	let {
		json = $bindable({ type: 'doc', content: [] }),
		schema,
		blocks,
		toolbarFeatures,
		toolbarExtensions,
		onChange
	}: Props = $props();

	const attributesController = createBlockAttributesController();

	function setJson(document: JSONContent) {
		json = document;
		onChange?.(document);
	}

	// Threaded callback replaces the old window-level `uncial:choose-attribute`
	// event so multiple editors on one Wagtail form never cross-talk. Only the
	// Wagtail image chooser is handled; other custom input kinds are ignored.
	function handleChooseAttribute(request: ChooseAttributeRequest) {
		if (request.inputKind !== 'wagtail-image') return;
		const event = new CustomEvent(CHOOSE_ATTRIBUTE_EVENT, {
			detail: request
		}) as ChooseAttributeEvent;
		void chooseImageForAttribute(event);
	}
</script>

<div class="uncial-wagtail-admin-editor">
	<div class="uncial-wagtail-admin-canvas">
		<Editor
			bind:json={() => json, setJson}
			{schema}
			{blocks}
			{toolbarFeatures}
			{toolbarExtensions}
			{attributesController}
		/>
	</div>
	<aside class="uncial-wagtail-admin-attrs" aria-label="Block attributes">
		<BlockAttributesPanel
			controller={attributesController}
			{blocks}
			onChooseAttribute={handleChooseAttribute}
		/>
	</aside>
</div>

<style>
	/* Wagtail caps form content at an ~840px reading measure via .w-form-width
	   (the tab's form column) and each field's .w-field__wrapper. That leaves the
	   editor's two-column canvas + attributes layout badly cramped. Lift the cap
	   on just the containers that hold an Uncial widget: the :has() selectors keep
	   this scoped so sibling fields (title, slug, …) keep their own wrapper cap
	   and stay at the normal measure. */
	:global(.w-form-width:has(.uncial-wagtail-widget)),
	:global(.w-panel__wrapper:has(.uncial-wagtail-widget)),
	:global(.w-field-row:has(.uncial-wagtail-widget)),
	:global(.w-field__wrapper:has(.uncial-wagtail-widget)) {
		max-width: none;
	}

	.uncial-wagtail-admin-editor {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem);
		gap: 1rem;
		align-items: start;
	}

	.uncial-wagtail-admin-editor :global(.uncial-editor-shell),
	.uncial-wagtail-admin-editor :global(.uncial-attrs-panel) {
		--uncial-color-bg: var(--w-color-surface-page, #fff);
		--uncial-color-surface: var(--w-color-surface-page, #fff);
		--uncial-color-surface-elevated: var(--w-color-surface-field, #f8fafc);
		--uncial-color-border: var(--w-color-border-field-default, #d1d5db);
		--uncial-color-border-strong: var(--w-color-border-field-hover, #9ca3af);
		--uncial-color-text: var(--w-color-text-label, #111827);
		--uncial-color-text-muted: var(--w-color-text-meta, #6b7280);
		--uncial-color-primary: var(--w-color-surface-button-default, var(--w-color-primary, #007d7e));
		--uncial-color-primary-contrast: var(--w-color-text-button, #fff);
		--uncial-color-focus-ring: var(--w-color-focus, var(--w-color-primary, #007d7e));
		--uncial-color-danger: var(--w-color-text-error, #cd4444);
		--uncial-font-body: var(
			--w-font-sans,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			system-ui,
			sans-serif
		);
		--uncial-font-display: var(--uncial-font-body);
	}

	.uncial-wagtail-admin-editor :global(.uncial-content:focus-visible) {
		outline: none;
	}

	.uncial-wagtail-admin-canvas,
	.uncial-wagtail-admin-attrs {
		min-width: 0;
	}

	.uncial-wagtail-admin-attrs {
		position: sticky;
		top: 1rem;
		border: 1px solid var(--w-color-border-field-default, #d1d5db);
		border-radius: 0.5rem;
		background: var(--w-color-surface-page, white);
		padding: 1rem;
	}

	@media (max-width: 64rem) {
		.uncial-wagtail-admin-editor {
			grid-template-columns: 1fr;
		}

		.uncial-wagtail-admin-attrs {
			position: static;
		}
	}
</style>
