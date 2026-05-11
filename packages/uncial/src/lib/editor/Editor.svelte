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

<div class="uncial-editor-shell min-w-0 rounded-box bg-base-100 shadow-sm">
	<div
		class="uncial-toolbar flex flex-wrap items-center gap-2 border-b border-base-300 bg-base-200/60 px-3 py-2"
	>
		<Toolbar
			{editor}
			{schema}
			{toolbarFeatures}
			{toolbarExtensions}
			onEditLink={() => controller.openLinkAttributes()}
		/>
		{#if activeBlocks.length > 0}
			<div class="ml-auto flex items-center gap-2">
				<details class="dropdown dropdown-end">
					<summary
						bind:this={attrsTriggerEl}
						aria-label="Insert block"
						class="btn btn-sm btn-primary gap-1.5"
					>
						<PlusIcon size={14} weight="bold" />
						<span>Insert block</span>
						<CaretDownIcon size={12} weight="bold" />
					</summary>
					<ul
						class="menu dropdown-content z-20 mt-2 w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-xl"
					>
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
	<div class="uncial-editor-body min-w-0">
		<div
			class="uncial-content uncial-rich-content uncial-gutter-enabled min-h-112 min-w-0 p-5 leading-7 sm:p-8"
			bind:this={editorHost}
			use:bindEditor={editorBinding}
		></div>
	</div>
</div>

<style>
	.uncial-content:focus-visible {
		outline: 2px solid var(--color-primary, #2563eb);
		outline-offset: -2px;
	}

	.uncial-content :global(.ProseMirror:focus) {
		outline: none;
		box-shadow: none;
	}

	/* --- Gutter layout --- */
	.uncial-editor-body {
		position: relative;
	}

	.uncial-content.uncial-gutter-enabled {
		padding-left: 5.5rem;
	}

	@media (max-width: 639px) {
		.uncial-content.uncial-gutter-enabled {
			padding-left: 3.5rem;
		}

		.uncial-content :global(.uncial-nodeview-gutter) {
			left: -3rem;
			width: 2.5rem;
		}

		.uncial-content :global(.uncial-gutter-label) {
			font-size: 0.5rem;
			max-width: 2.25rem;
		}

		.uncial-content
			:global(.uncial-nodeview[data-uncial-block-id='row'] .uncial-row-items .uncial-nodeview) {
			flex-basis: 100%;
		}
	}

	@media (max-width: 419px) {
		.uncial-content.uncial-gutter-enabled {
			padding-left: 1rem;
		}

		.uncial-content :global(.uncial-nodeview-gutter) {
			position: static;
			width: auto;
			margin-bottom: 0.35rem;
			flex-direction: row;
			align-items: center;
			justify-content: flex-start;
		}

		.uncial-content :global(.uncial-gutter-label) {
			max-width: none;
			word-break: normal;
		}
	}

	/* --- Block node views --- */
	.uncial-content :global(.uncial-nodeview) {
		position: relative;
		border-radius: 12px;
		transition:
			box-shadow 140ms ease,
			transform 140ms ease;
	}

	/* --- Gutter strip per block --- */
	.uncial-content :global(.uncial-nodeview-frame),
	.uncial-content :global(.uncial-nodeview-host) {
		display: block;
		line-height: normal;
	}

	.uncial-content :global(.uncial-nodeview-body) {
		display: flow-root;
		line-height: normal;
	}

	.uncial-content :global(.uncial-nodeview-gutter) {
		position: absolute;
		left: -4.75rem;
		top: 0;
		bottom: 0;
		width: 4rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		user-select: none;
		pointer-events: auto;
	}

	.uncial-content :global(.uncial-gutter-drag) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 0.375rem;
		border: none;
		background: var(--color-base-200, #f0f0f0);
		color: var(--color-base-content, #333);
		opacity: 0.5;
		transition:
			opacity 140ms ease,
			background 140ms ease;
		padding: 0;
	}

	.uncial-content :global(.uncial-nodeview-gutter:hover .uncial-gutter-drag) {
		opacity: 1;
		background: var(--color-base-300, #e0e0e0);
	}

	.uncial-content :global(.uncial-gutter-drag:active) {
		cursor: grabbing;
	}

	.uncial-content :global(.uncial-gutter-label) {
		border: none;
		background: transparent;
		padding: 0;
		border-radius: 0.25rem;
		cursor: pointer;
		font-size: 0.6rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-base-content, #333);
		opacity: 0.4;
		line-height: 1;
		text-align: center;
		word-break: break-word;
		max-width: 3.5rem;
		transition:
			opacity 140ms ease,
			background 140ms ease,
			color 140ms ease;
	}

	.uncial-content :global(.uncial-nodeview-gutter:hover .uncial-gutter-label) {
		opacity: 0.8;
	}

	.uncial-content :global(.uncial-gutter-label:hover),
	.uncial-content :global(.uncial-gutter-label:focus-visible) {
		background: color-mix(in srgb, var(--color-primary, #2563eb) 12%, transparent);
		color: var(--color-primary, #2563eb);
		opacity: 1;
	}

	/* --- Hover highlight: outline the block when gutter is hovered --- */
	.uncial-content
		:global(.uncial-nodeview:has(.uncial-nodeview-gutter:hover) > .uncial-nodeview-host .uncial-nodeview-body > *) {
		outline: 2px dashed color-mix(in srgb, var(--color-primary, #2563eb) 35%, transparent);
		outline-offset: 4px;
	}

	/* --- Row block editor layout --- */
	.uncial-content
		:global(
			.uncial-nodeview[data-uncial-block-id='row'] .uncial-row-items .uncial-nodeview-content
		),
	.uncial-content
		:global(.uncial-nodeview[data-uncial-block-id='row'] .uncial-row-items .uncial-nodeview-host),
	.uncial-content
		:global(.uncial-nodeview[data-uncial-block-id='row'] .uncial-row-items .uncial-nodeview-frame),
	.uncial-content
		:global(.uncial-nodeview[data-uncial-block-id='row'] .uncial-row-items .uncial-nodeview-body) {
		display: contents;
	}

	.uncial-content
		:global(.uncial-nodeview[data-uncial-block-id='row'] .uncial-row-items .uncial-nodeview) {
		flex: 1 1 16rem;
		min-width: 0;
	}

	/* --- Nested block gutter: label visible on hover, no drag handle --- */
	.uncial-content :global(.uncial-nodeview .uncial-nodeview .uncial-nodeview-gutter) {
		left: 0;
		top: -0.125rem;
		bottom: auto;
		width: auto;
		flex-direction: row;
		padding: 0.125rem 0.375rem;
		border-right: none;
		opacity: 0;
		z-index: 10;
		transition: opacity 140ms ease;
		background: var(--color-base-200, #f0f0f0);
		border-radius: 0.25rem 0.25rem 0 0;
	}

	.uncial-content :global(.uncial-nodeview .uncial-nodeview:hover .uncial-nodeview-gutter) {
		opacity: 1;
	}

	/* Hide drag handle in nested blocks — reordering via sidebar */
	.uncial-content :global(.uncial-nodeview .uncial-nodeview .uncial-gutter-drag) {
		display: none;
	}

	/* --- Selected / active block --- */
	.uncial-content
		:global(.uncial-nodeview.ProseMirror-selectednode > .uncial-nodeview-host .uncial-nodeview-body > *),
	.uncial-content
		:global(.uncial-nodeview.uncial-active-block > .uncial-nodeview-host .uncial-nodeview-body > *) {
		outline: 2px solid color-mix(in srgb, var(--color-primary, #2563eb) 55%, transparent);
		outline-offset: 4px;
		box-shadow: 0 0 0 6px color-mix(in srgb, var(--color-primary, #2563eb) 10%, transparent);
	}
</style>
