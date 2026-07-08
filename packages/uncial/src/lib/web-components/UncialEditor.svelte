<script lang="ts">
	import type { AnyExtension, JSONContent } from '@tiptap/core';
	import Editor from '../editor/Editor.svelte';
	import type {
		BlockAttributesController,
		ToolbarFeature,
		ToolbarFeatureSelection
	} from '../editor/index.js';
	import type {
		AttributeSpec,
		BlockDefinition,
		BlockRegistry,
		ContentSchema,
		DocumentMetaSchema,
		ValidationIssue
	} from '../core/types.js';
	import { emptyDocument } from '../shared/content.js';

	interface Props {
		blocks?: BlockRegistry | BlockDefinition[];
		schema?: ContentSchema;
		json?: JSONContent;
		meta?: Record<string, unknown>;
		metaFields?: DocumentMetaSchema | ReadonlyMap<string, AttributeSpec<unknown>>;
		extensions?: AnyExtension[];
		toolbarFeatures?: ToolbarFeatureSelection;
		toolbarExtensions?: ToolbarFeature[];
		attributesController?: BlockAttributesController | null;
		onIssue?: (issue: ValidationIssue) => void;
		onChange?: (document: JSONContent) => void;
		onMetaChange?: (meta: Record<string, unknown>) => void;
	}

	let {
		blocks = [],
		schema = undefined,
		json = $bindable(emptyDocument()),
		meta = $bindable({}),
		metaFields = undefined,
		extensions = [],
		toolbarFeatures = undefined,
		toolbarExtensions = [],
		attributesController = null,
		onIssue,
		onChange,
		onMetaChange
	}: Props = $props();

	function dispatchIssue(issue: ValidationIssue): void {
		onIssue?.(issue);
	}

	function setJson(nextDocument: JSONContent): void {
		json = nextDocument;
		onChange?.(nextDocument);
	}

	function setMeta(nextMeta: Record<string, unknown>): void {
		meta = nextMeta;
		onMetaChange?.(nextMeta);
	}
</script>

<Editor
	{blocks}
	{schema}
	bind:json={() => json, setJson}
	bind:meta={() => meta, setMeta}
	{metaFields}
	{extensions}
	{toolbarFeatures}
	{toolbarExtensions}
	{attributesController}
	onIssue={dispatchIssue}
/>
