<script lang="ts">
	import BlockAttributesPanel from '../../../uncial/src/lib/editor/BlockAttributesPanel.svelte';
	import Editor from '../../../uncial/src/lib/editor/Editor.svelte';
	import { createBlockAttributesController } from '../../../uncial/src/lib/editor/attributesController.js';
	import type { BlockRegistry, ContentSchema } from '../../../uncial/src/lib/core/types.js';
	import type { ToolbarFeatureSelection } from '../../../uncial/src/lib/editor/index.js';

	type JSONContent = Record<string, unknown>;

	interface Props {
		json?: JSONContent;
		schema?: ContentSchema;
		blocks?: BlockRegistry;
		toolbarFeatures?: ToolbarFeatureSelection;
		onChange?: (document: JSONContent) => void;
	}

	let { json = $bindable({ type: 'doc', content: [] }), schema, blocks, toolbarFeatures, onChange }: Props =
		$props();

	const attributesController = createBlockAttributesController();

	function setJson(document: JSONContent) {
		json = document;
		onChange?.(document);
	}
</script>

<div class="uncial-wagtail-admin-editor">
	<div class="uncial-wagtail-admin-canvas">
		<Editor bind:json={() => json, setJson} {schema} {blocks} {toolbarFeatures} {attributesController} />
	</div>
	<aside class="uncial-wagtail-admin-attrs" aria-label="Block attributes">
		<BlockAttributesPanel controller={attributesController} {blocks} />
	</aside>
</div>

<style>
	.uncial-wagtail-admin-editor {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem);
		gap: 1rem;
		align-items: start;
	}

	.uncial-wagtail-admin-canvas,
	.uncial-wagtail-admin-attrs {
		min-width: 0;
	}

	.uncial-wagtail-admin-attrs {
		position: sticky;
		top: 1rem;
		border: 1px solid var(--color-base-300, #ddd);
		border-radius: 0.5rem;
		background: var(--color-base-100, white);
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
