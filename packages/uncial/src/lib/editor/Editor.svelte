<script lang="ts">
	import type { AnyExtension, Editor as TiptapEditor, JSONContent } from '@tiptap/core';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
	import { resolveRegistry } from '../core/registry.js';
	import type {
		AttributeSpec,
		BlockDefinition,
		BlockRegistry,
		ContentSchema,
		DocumentMetaSchema,
		ValidationIssue
	} from '../core/types.js';
	import { emptyDocument } from '../shared/content.js';
	import {
		createBlockAttributesController,
		createInitialState,
		type BlockAttributesController,
		type BlockAttributesState
	} from './attributesController.js';
	import { bindEditor, type BindEditorOptions } from './bindEditor.js';
	import {
		createDocumentMetaController,
		type DocumentMetaController,
		type DocumentMetaState
	} from './metaController.js';
	import DocumentMetaPanel from './DocumentMetaPanel.svelte';
	import Toolbar from './Toolbar.svelte';
	import { dropdownDismiss } from './dropdownDismiss.js';
	import type { ToolbarFeature, ToolbarFeatureSelection } from './toolbarFeatures.js';

	interface Props {
		blocks?: BlockRegistry | BlockDefinition[];
		schema?: ContentSchema;
		json?: JSONContent;
		extensions?: AnyExtension[];
		meta?: Record<string, unknown>;
		metaFields?: DocumentMetaSchema | ReadonlyMap<string, AttributeSpec<unknown>>;
		toolbarFeatures?: ToolbarFeatureSelection;
		toolbarExtensions?: ToolbarFeature[];
		attributesController?: BlockAttributesController | null;
		metaController?: DocumentMetaController | null;
		onIssue?: (issue: ValidationIssue) => void;
	}

	let {
		blocks = [],
		schema = undefined,
		json = $bindable(emptyDocument()),
		extensions = [],
		meta = $bindable({}),
		metaFields = undefined,
		toolbarFeatures = undefined,
		toolbarExtensions = [],
		attributesController = null,
		metaController = null,
		onIssue
	}: Props = $props();

	let editorHost: HTMLDivElement;
	let editor = $state<TiptapEditor | null>(null);
	let interactedNodeView = $state<HTMLElement | null>(null);
	let controllerState = $state<BlockAttributesState>(createInitialState());
	let attrsTriggerEl = $state<HTMLElement | null>(null);
	let metaTriggerEl = $state<HTMLElement | null>(null);
	const internalController = createBlockAttributesController();
	const internalMetaController = createDocumentMetaController();
	let metaState = $state<DocumentMetaState>({
		draft: {},
		errors: {},
		dirty: false
	});
	let committedMetaSerialized = JSON.stringify(meta);

	const registry = $derived(resolveRegistry(blocks));
	const controller = $derived(attributesController ?? internalController);
	const resolvedMetaFields = $derived.by(() => {
		if (metaFields instanceof Map) return metaFields;
		if (metaFields) return new Map(Object.entries(metaFields));
		return schema?.metaFields ?? new Map<string, AttributeSpec<unknown>>();
	});
	const documentMetaController = $derived(metaController ?? internalMetaController);
	const hasMetaFields = $derived(resolvedMetaFields.size > 0);
	const editorBinding = $derived<BindEditorOptions>({
		blocks,
		schema,
		json,
		meta,
		extensions,
		attributesController: controller,
		onIssue,
		onChange: (nextDocument) => {
			json = nextDocument;
		},
		onMetaChange: (nextMeta) => {
			meta = nextMeta;
			committedMetaSerialized = JSON.stringify(nextMeta);
			documentMetaController.reset(nextMeta);
		},
		onEditor: (nextEditor) => {
			editor = nextEditor;
		}
	});
	const activeBlocks = $derived.by(() =>
		registry.blocks.filter((block) =>
			controllerState.allowedBlockIds.length
				? controllerState.allowedBlockIds.includes(block.id)
				: !schema || schema.allowedBlocks.has(block.id)
		)
	);
	const editorGutterWidth = $derived.by(() => {
		const longestLabelLength = registry.blocks.reduce(
			(longest, block) => Math.max(longest, block.label.length),
			0
		);

		return `max(var(--uncial-gutter-width), ${longestLabelLength * 0.68 + 1.75}rem)`;
	});
	function insertBlock(blockId: string): void {
		const ok = controller.insertBlock(blockId);
		// Close the dropdown after an insert attempt.
		attrsTriggerEl?.closest('details')?.removeAttribute('open');
		if (!ok) return;

		requestAnimationFrame(() => {
			controller.syncFromSelection();
			if (controller.getActiveBlock()?.id === blockId) {
				controller.openAttributes(blockId);
			}
		});
	}

	function commitMeta(nextMeta: Record<string, unknown>): void {
		meta = nextMeta;
		json = { ...json, meta: nextMeta };
		committedMetaSerialized = JSON.stringify(nextMeta);
		metaTriggerEl?.closest('details')?.removeAttribute('open');
	}

	function syncActiveBlockIndicator(): void {
		if (!editorHost) return;

		const activeNodes = editorHost.querySelectorAll<HTMLElement>(
			'.uncial-nodeview.uncial-active-block'
		);
		activeNodes.forEach((node) => {
			node.classList.remove('uncial-active-block');
		});

		const activePos = controllerState.activeBlock?.pos;
		if (activePos === undefined) {
			const domActiveNode = interactedNodeView ?? resolveSelectionNodeView();
			domActiveNode?.classList.add('uncial-active-block');
			return;
		}

		const activeNode = editorHost.querySelector<HTMLElement>(
			`.uncial-nodeview[data-uncial-block-pos="${activePos}"]`
		);
		if (activeNode) {
			activeNode.classList.add('uncial-active-block');
			return;
		}

		const domActiveNode = interactedNodeView ?? resolveSelectionNodeView();
		domActiveNode?.classList.add('uncial-active-block');
	}

	function resolveSelectionNodeView(): HTMLElement | null {
		const selection = window.getSelection();
		const anchorNode = selection?.anchorNode;
		if (!anchorNode) return null;

		const target =
			anchorNode instanceof Element
				? anchorNode
				: (anchorNode.parentElement ?? anchorNode.parentNode);
		if (!(target instanceof Element)) return null;

		return target.closest<HTMLElement>('.uncial-nodeview');
	}

	$effect(() => {
		const unsubscribe = controller.subscribe((state) => {
			controllerState = state;
		});

		return unsubscribe;
	});

	$effect(() => {
		documentMetaController.setMetaFields(resolvedMetaFields);
	});

	$effect(() => {
		const serialized = JSON.stringify(meta);
		if (serialized === committedMetaSerialized) return;
		committedMetaSerialized = serialized;
		documentMetaController.reset(meta);
	});

	$effect(() => {
		const unsubscribe = documentMetaController.subscribe((state) => {
			metaState = state;
		});

		return unsubscribe;
	});

	$effect(() => {
		if (metaState.dirty) return;
		const nextMeta = documentMetaController.getMeta();
		const serialized = JSON.stringify(nextMeta);
		if (serialized === committedMetaSerialized) return;

		committedMetaSerialized = serialized;
		meta = nextMeta;
		json = { ...json, meta: nextMeta };
	});

	$effect(() => {
		void controllerState.activeBlock;
		requestAnimationFrame(() => {
			syncActiveBlockIndicator();
		});
	});

	$effect(() => {
		if (!editorHost) return;

		const syncFromDomSelection = () => {
			requestAnimationFrame(() => {
				syncActiveBlockIndicator();
			});
		};

		const trackInteractedNodeView = (event: Event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			interactedNodeView = target.closest<HTMLElement>('.uncial-nodeview');
			syncFromDomSelection();
		};

		editorHost.addEventListener('mousedown', trackInteractedNodeView, true);
		editorHost.addEventListener('mouseup', syncFromDomSelection);
		editorHost.addEventListener('keyup', syncFromDomSelection);
		editorHost.addEventListener('focusin', trackInteractedNodeView, true);

		return () => {
			editorHost.removeEventListener('mousedown', trackInteractedNodeView, true);
			editorHost.removeEventListener('mouseup', syncFromDomSelection);
			editorHost.removeEventListener('keyup', syncFromDomSelection);
			editorHost.removeEventListener('focusin', trackInteractedNodeView, true);
		};
	});
</script>

<div class="uncial-editor-shell">
	<div class="uncial-toolbar">
		<Toolbar
			{editor}
			{schema}
			{toolbarFeatures}
			{toolbarExtensions}
			onEditLink={() => controller.openLinkAttributes()}
		/>
		{#if hasMetaFields || activeBlocks.length > 0}
			<div class="uncial-toolbar__actions">
				{#if hasMetaFields}
					<details class="uncial-dropdown uncial-dropdown--end" use:dropdownDismiss>
						<summary
							bind:this={metaTriggerEl}
							aria-label="Edit document metadata"
							class="uncial-btn uncial-btn--ghost uncial-btn--sm"
						>
							<span>Metadata</span>
							<CaretDownIcon size={12} weight="bold" />
						</summary>
						<div class="uncial-dropdown__menu uncial-dropdown__menu--wide">
							<DocumentMetaPanel
								controller={documentMetaController}
								fields={resolvedMetaFields}
								onCommit={commitMeta}
							/>
						</div>
					</details>
				{/if}
				{#if activeBlocks.length > 0}
					<details class="uncial-dropdown uncial-dropdown--end" use:dropdownDismiss>
						<summary
							bind:this={attrsTriggerEl}
							aria-label="Insert block"
							class="uncial-btn uncial-btn--primary uncial-btn--sm"
						>
							<PlusIcon size={14} weight="bold" />
							<span>Insert block</span>
							<CaretDownIcon size={12} weight="bold" />
						</summary>
						<ul class="uncial-dropdown__menu uncial-menu">
							{#each activeBlocks as block (block.id)}
								<li>
									<button type="button" onclick={() => insertBlock(block.id)}>
										{block.label}
									</button>
								</li>
							{/each}
						</ul>
					</details>
				{/if}
			</div>
		{/if}
	</div>
	<div class="uncial-editor-body">
		<div
			class="uncial-content uncial-rich-content uncial-gutter-enabled"
			style:--uncial-reserved-gutter-width={editorGutterWidth}
			bind:this={editorHost}
			use:bindEditor={editorBinding}
		></div>
	</div>
</div>
