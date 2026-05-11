<script lang="ts">
	import type { AnyExtension, JSONContent } from '@tiptap/core';
	import Editor from '../editor/Editor.svelte';
	import type {
		BlockAttributesController,
		ToolbarFeature,
		ToolbarFeatureSelection
	} from '../editor/index.js';
	import type {
		BlockDefinition,
		BlockRegistry,
		ContentSchema,
		ValidationIssue
	} from '../core/types.js';
	import { emptyDocument } from '../shared/content.js';

	interface Props {
		blocks?: BlockRegistry | BlockDefinition[];
		schema?: ContentSchema;
		json?: JSONContent;
		extensions?: AnyExtension[];
		toolbarFeatures?: ToolbarFeatureSelection;
		toolbarExtensions?: ToolbarFeature[];
		attributesController?: BlockAttributesController | null;
		onIssue?: (issue: ValidationIssue) => void;
		onChange?: (document: JSONContent) => void;
	}

	let {
		blocks = [],
		schema = undefined,
		json = $bindable(emptyDocument()),
		extensions = [],
		toolbarFeatures = undefined,
		toolbarExtensions = [],
		attributesController = null,
		onIssue,
		onChange
	}: Props = $props();

	function dispatchIssue(issue: ValidationIssue): void {
		onIssue?.(issue);
	}

	function setJson(nextDocument: JSONContent): void {
		json = nextDocument;
		onChange?.(nextDocument);
	}
</script>

<Editor
	{blocks}
	{schema}
	bind:json={() => json, setJson}
	{extensions}
	{toolbarFeatures}
	{toolbarExtensions}
	{attributesController}
	onIssue={dispatchIssue}
/>
