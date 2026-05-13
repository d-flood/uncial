<script lang="ts">
	import { resolveRegistry } from '../core/registry.js';
	import type { AttributeSpec, BlockDefinition, BlockRegistry } from '../core/types.js';
	import { CODE_BLOCK_ID, codeBlockAttributeTarget } from '../shared/codeBlockAttributes.js';
	import type { BlockAttributesController, BlockAttributesState } from './attributesController.js';
	import { flip } from 'svelte/animate';
	import ArrowUpIcon from 'phosphor-svelte/lib/ArrowUpIcon';
	import ArrowDownIcon from 'phosphor-svelte/lib/ArrowDownIcon';
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
	import DotsSixVerticalIcon from 'phosphor-svelte/lib/DotsSixVerticalIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	import LinkAttributesPanel from './LinkAttributesPanel.svelte';
	import AttributeFieldControl from './AttributeFieldControl.svelte';

	interface Props {
		controller: BlockAttributesController;
		blocks?: BlockRegistry | BlockDefinition[];
	}

	let { controller, blocks = [] }: Props = $props();

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

	const registry = $derived(resolveRegistry(blocks));
	const selectedBlock = $derived.by(() => {
		if (controllerState.selectedBlockId === CODE_BLOCK_ID) return codeBlockAttributeTarget;
		return controllerState.selectedBlockId
			? (registry.get(controllerState.selectedBlockId) ?? null)
			: null;
	});
	const selectedAttributeSpecs = $derived(
		selectedBlock
			? (Object.entries(selectedBlock.attributes) as Array<[string, AttributeSpec<unknown>]>)
			: []
	);
	let childBlockQuery = $state('');
	const hasChildren = $derived(controllerState.containerChildren.length > 0);
	const canRemoveChild = $derived(controllerState.containerChildren.length > 1);
	const activeBlocks = $derived.by(() =>
		registry.blocks.filter((block) =>
			controllerState.allowedBlockIds.length
				? controllerState.allowedBlockIds.includes(block.id)
				: true
		)
	);
	const canAddNestedBlock = $derived(
		controllerState.mode === 'edit' &&
			Boolean(controllerState.activeBlock) &&
			Boolean(selectedBlock && 'content' in selectedBlock && selectedBlock.content)
	);
	const filteredChildBlocks = $derived.by(() => {
		const query = childBlockQuery.trim().toLowerCase();
		return activeBlocks.filter((block) => !query || block.label.toLowerCase().includes(query));
	});
	let draggingChildIndex = $state<number | null>(null);
	let draggingPointerId = $state<number | null>(null);

	function moveUp(index: number): void {
		if (index > 0) controller.moveContainerChild(index, index - 1);
	}

	function moveDown(index: number): void {
		if (index < controllerState.containerChildren.length - 1) {
			controller.moveContainerChild(index, index + 1);
		}
	}

	function addNestedBlock(blockId: string): void {
		if (controller.insertContainerChild(blockId)) {
			childBlockQuery = '';
		}
	}

	function chooseCustomAttribute(name: string, inputKind: string): void {
		window.dispatchEvent(
			new CustomEvent('uncial:choose-attribute', {
				detail: {
					inputKind,
					name,
					attrs: controllerState.draftAttrs,
					setAttrs: (attrs: Record<string, unknown>) => {
						for (const [key, value] of Object.entries(attrs)) {
							controller.setDraftAttr(key, value);
						}
					}
				}
			})
		);
	}

	function startChildDrag(event: PointerEvent, index: number): void {
		event.stopPropagation();
		draggingChildIndex = index;
		draggingPointerId = event.pointerId;
		event.preventDefault();
	}

	function handleChildDragMove(event: PointerEvent): void {
		if (draggingChildIndex === null || draggingPointerId !== event.pointerId) return;
		const target = document
			.elementFromPoint(event.clientX, event.clientY)
			?.closest('[data-child-index]');
		if (!(target instanceof HTMLElement)) return;
		const targetIndex = Number(target.dataset.childIndex);
		if (!Number.isInteger(targetIndex) || targetIndex === draggingChildIndex) return;
		if (controller.moveContainerChild(draggingChildIndex, targetIndex)) {
			draggingChildIndex = targetIndex;
		}
	}

	function stopChildDrag(event: PointerEvent): void {
		if (draggingPointerId !== event.pointerId) return;
		draggingChildIndex = null;
		draggingPointerId = null;
	}

	$effect(() => {
		const unsubscribe = controller.subscribe((state) => {
			controllerState = state;
		});

		return unsubscribe;
	});
</script>

<svelte:document
	onpointermove={handleChildDragMove}
	onpointerup={stopChildDrag}
	onpointercancel={stopChildDrag}
/>

<div class="uncial-attrs-panel">
	{#if controllerState.link.open}
		<LinkAttributesPanel
			attrs={controllerState.link.attrs}
			onChange={(name, value) => controller.setLinkAttr(name, value)}
			onApply={() => controller.commitLinkAttributes()}
			onRemove={() => controller.removeLink()}
			onClose={() => controller.closeLinkAttributes()}
		/>
	{:else if controllerState.open && selectedBlock}
		<p class="uncial-attrs-title">
			{controllerState.mode === 'edit' ? 'Edit' : 'Configure'}
			{selectedBlock.label || controllerState.selectedBlockId || 'block'}
		</p>
		{#each selectedAttributeSpecs as [name, spec] (name)}
			<AttributeFieldControl
				{name}
				{spec}
				value={controllerState.draftAttrs[name]}
				error={controllerState.validationErrors[name]}
				onChange={(value) => controller.setDraftAttr(name, value)}
				onCustom={chooseCustomAttribute}
			/>
		{/each}
		<div class="uncial-panel__actions">
			{#if controllerState.mode === 'edit'}
				<button
					type="button"
					class="uncial-btn uncial-btn--danger uncial-btn--outline uncial-btn--sm"
					onclick={() => controller.removeActiveBlock()}
				>
					Remove Block
				</button>
			{/if}
			{#if controllerState.mode !== 'edit' && controllerState.selectedBlockId !== CODE_BLOCK_ID}
				<button
					type="button"
					class="uncial-btn uncial-btn--primary uncial-btn--sm"
					onclick={() => controller.commit()}
				>
					Insert Block
				</button>
			{/if}
		</div>
	{:else}
		<p class="uncial-help-text">Select a block to edit its attributes.</p>
	{/if}

	{#if !controllerState.link.open && canAddNestedBlock}
		<div class="uncial-children-section">
			<div class="uncial-children-section__header">
				<p class="uncial-section-label">Nested blocks</p>
				{#if activeBlocks.length > 0}
					<details class="uncial-dropdown uncial-dropdown--end">
						<summary class="uncial-btn uncial-btn--primary uncial-btn--xs">
							<PlusIcon size={12} weight="bold" />
							<span>Add block</span>
							<CaretDownIcon size={10} weight="bold" />
						</summary>
						<div class="uncial-dropdown__menu uncial-dropdown__menu--wide">
							<input
								class="uncial-input uncial-input--xs uncial-input--block uncial-dropdown__search"
								type="search"
								placeholder="Filter blocks..."
								bind:value={childBlockQuery}
							/>
							<ul class="uncial-menu uncial-menu--scroll">
								{#each filteredChildBlocks as block (block.id)}
									<li>
										<button type="button" onclick={() => addNestedBlock(block.id)}>
											{block.label}
										</button>
									</li>
								{:else}
									<li class="uncial-menu__empty">No matching blocks</li>
								{/each}
							</ul>
						</div>
					</details>
				{/if}
			</div>
			{#if hasChildren}
				<ul class="uncial-children-list">
					{#each controllerState.containerChildren as child, index (child.key)}
						<li
							class={[
								'uncial-child-item',
								draggingChildIndex === index ? 'uncial-child-item--dragging' : ''
							]}
							data-child-index={index}
							animate:flip={{ duration: 120 }}
						>
							<button
								type="button"
								class="uncial-btn uncial-btn--ghost uncial-btn--xs uncial-btn--square uncial-btn--drag"
								aria-label="Drag nested block"
								onpointerdown={(event) => startChildDrag(event, index)}
							>
								<DotsSixVerticalIcon size={12} weight="bold" />
							</button>
							<div class="uncial-child-item__content">
								<span class="uncial-child-item__label">{child.label}</span>
								{#if child.summary}
									<span class="uncial-child-item__summary">{child.summary}</span>
								{/if}
							</div>
							<div class="uncial-child-item__actions">
								<button
									type="button"
									class="uncial-btn uncial-btn--ghost uncial-btn--xs uncial-btn--square"
									aria-label="Move up"
									disabled={index === 0}
									onclick={(event) => {
										event.stopPropagation();
										moveUp(index);
									}}
								>
									<ArrowUpIcon size={12} weight="bold" />
								</button>
								<button
									type="button"
									class="uncial-btn uncial-btn--ghost uncial-btn--xs uncial-btn--square"
									aria-label="Move down"
									disabled={index === controllerState.containerChildren.length - 1}
									onclick={(event) => {
										event.stopPropagation();
										moveDown(index);
									}}
								>
									<ArrowDownIcon size={12} weight="bold" />
								</button>
								<button
									type="button"
									class="uncial-btn uncial-btn--ghost uncial-btn--danger uncial-btn--xs uncial-btn--square"
									aria-label="Remove nested block"
									disabled={!canRemoveChild}
									onclick={(event) => {
										event.stopPropagation();
										controller.removeContainerChild(index);
									}}
								>
									<TrashIcon size={12} weight="bold" />
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="uncial-help-text">No nested blocks yet.</p>
			{/if}
		</div>
	{/if}
</div>
