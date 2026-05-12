<script lang="ts">
	import type { AnyExtension, Editor as TiptapEditor, JSONContent } from '@tiptap/core';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
	import { resolveRegistry } from '../core/registry.js';
	import type {
		BlockDefinition,
		BlockRegistry,
		ContentSchema,
		ValidationIssue
	} from '../core/types.js';
	import { emptyDocument } from '../shared/content.js';
	import {
		createBlockAttributesController,
		type BlockAttributesController,
		type BlockAttributesState
	} from './attributesController.js';
	import { bindEditor, type BindEditorOptions } from './bindEditor.js';
	import Toolbar from './Toolbar.svelte';
	import type { ToolbarFeature, ToolbarFeatureSelection } from './toolbarFeatures.js';

	interface Props {
		blocks?: BlockRegistry | BlockDefinition[];
		schema?: ContentSchema;
		json?: JSONContent;
		extensions?: AnyExtension[];
		toolbarFeatures?: ToolbarFeatureSelection;
		toolbarExtensions?: ToolbarFeature[];
		attributesController?: BlockAttributesController | null;
		onIssue?: (issue: ValidationIssue) => void;
	}

	let {
		blocks = [],
		schema = undefined,
		json = $bindable(emptyDocument()),
		extensions = [],
		toolbarFeatures = undefined,
		toolbarExtensions = [],
		attributesController = null,
		onIssue
	}: Props = $props();

	let editorHost: HTMLDivElement;
	let editor = $state<TiptapEditor | null>(null);
	let interactedNodeView = $state<HTMLElement | null>(null);
	let controllerState = $state<BlockAttributesState>({
		open: false,
		mode: null,
		selectedBlockId: '',
		draftAttrs: {},
		validationErrors: {},
		activeBlock: null,
		allowedBlockIds: [],
		containerChildren: [],
		link: {
			open: false,
			attrs: {}
		}
	});
	let attrsTriggerEl = $state<HTMLElement | null>(null);
	const internalController = createBlockAttributesController();

	const registry = $derived(resolveRegistry(blocks));
	const controller = $derived(attributesController ?? internalController);
	const editorBinding = $derived<BindEditorOptions>({
		blocks,
		schema,
		json,
		extensions,
		attributesController: controller,
		onIssue,
		onChange: (nextDocument) => {
			json = nextDocument;
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
		{#if activeBlocks.length > 0}
			<div class="uncial-toolbar__actions">
				<details class="uncial-dropdown uncial-dropdown--end">
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
			</div>
		{/if}
	</div>
	<div class="uncial-editor-body">
		<div
			class="uncial-content uncial-rich-content uncial-gutter-enabled"
			bind:this={editorHost}
			use:bindEditor={editorBinding}
		></div>
	</div>
</div>
