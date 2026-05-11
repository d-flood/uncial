<script lang="ts">
	import { inferAttributeInputKind, normalizeAttributeOptions } from '../core/attributes.js';
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
	import RichTextAttributeEditor from './RichTextAttributeEditor.svelte';
	import LinkAttributesPanel from './LinkAttributesPanel.svelte';

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

	function getDraftStringValue(name: string): string {
		const value = controllerState.draftAttrs[name];
		if (typeof value === 'string') return value;
		if (value === undefined || value === null) return '';
		return String(value);
	}

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
		<p class="uncial-attrs-title text-sm font-bold">
			{controllerState.mode === 'edit' ? 'Edit' : 'Configure'}
			{selectedBlock.label || controllerState.selectedBlockId || 'block'}
		</p>
		{#each selectedAttributeSpecs as [name, spec] (name)}
			{@const inputKind = inferAttributeInputKind(spec)}
			<div class="form-control mb-3 grid gap-1">
				<span class="label-text text-xs font-semibold uppercase tracking-wide opacity-70"
					>{name}</span
				>
				{#if inputKind === 'checkbox'}
					<input
						class="checkbox checkbox-sm"
						type="checkbox"
						checked={Boolean(controllerState.draftAttrs[name])}
						onchange={(event) => {
							const target = event.currentTarget as HTMLInputElement;
							controller.setDraftAttr(name, target.checked);
						}}
					/>
				{:else if inputKind === 'number'}
					<input
						class="input input-bordered input-sm"
						type="number"
						placeholder={spec.placeholder ?? name}
						value={controllerState.draftAttrs[name] ?? ''}
						oninput={(event) => {
							const target = event.currentTarget as HTMLInputElement;
							controller.setDraftAttr(name, target.value === '' ? '' : target.valueAsNumber);
						}}
					/>
				{:else if inputKind === 'richtext'}
					<RichTextAttributeEditor
						value={controllerState.draftAttrs[name]}
						features={spec.richText?.features}
						placeholder={spec.richText?.placeholder ?? spec.placeholder ?? name}
						onChange={(value) => controller.setDraftAttr(name, value)}
					/>
				{:else if inputKind === 'select'}
					{@const options = normalizeAttributeOptions(spec) ?? []}
					<select
						class="select select-bordered select-sm"
						aria-label={name}
						value={getDraftStringValue(name)}
						onchange={(event) => {
							const target = event.currentTarget as HTMLSelectElement;
							controller.setDraftAttr(name, target.value);
						}}
					>
						{#each options as option (String(option.value))}
							<option value={String(option.value)}>{option.label ?? String(option.value)}</option>
						{/each}
					</select>
				{:else if inputKind === 'textarea' || inputKind === 'json'}
					<textarea
						class="textarea textarea-bordered min-h-28"
						placeholder={spec.placeholder ?? name}
						spellcheck={inputKind !== 'json'}
						value={getDraftStringValue(name)}
						oninput={(event) => {
							const target = event.currentTarget as HTMLTextAreaElement;
							controller.setDraftAttr(name, target.value);
						}}
					></textarea>
				{:else}
					<input
						class="input input-bordered input-sm"
						type="text"
						placeholder={spec.placeholder ?? name}
						value={getDraftStringValue(name)}
						oninput={(event) => {
							const target = event.currentTarget as HTMLInputElement;
							controller.setDraftAttr(name, target.value);
						}}
					/>
				{/if}
				{#if controllerState.validationErrors[name]}
					<span class="text-xs text-error">{controllerState.validationErrors[name]}</span>
				{/if}
			</div>
		{/each}
		<div
			class="sticky -bottom-4 flex flex-wrap items-center justify-between gap-2 bg-base-100 pt-3"
		>
			{#if controllerState.mode === 'edit'}
				<button
					type="button"
					class="btn btn-error btn-outline btn-sm"
					onclick={() => controller.removeActiveBlock()}
				>
					Remove Block
				</button>
			{/if}
			{#if controllerState.mode !== 'edit' && controllerState.selectedBlockId !== CODE_BLOCK_ID}
				<button type="button" class="btn btn-primary btn-sm" onclick={() => controller.commit()}>
					Insert Block
				</button>
			{/if}
		</div>
	{:else}
		<p class="text-sm opacity-60">Select a block to edit its attributes.</p>
	{/if}

	{#if !controllerState.link.open && canAddNestedBlock}
		<div class="uncial-children-section mt-6 border-t border-base-300 pt-4">
			<div class="mb-3 flex items-center justify-between gap-2">
				<p class="text-xs font-bold uppercase tracking-wide opacity-60">Nested blocks</p>
				{#if activeBlocks.length > 0}
					<details class="dropdown dropdown-end">
						<summary class="btn btn-primary btn-xs gap-1">
							<PlusIcon size={12} weight="bold" />
							<span>Add block</span>
							<CaretDownIcon size={10} weight="bold" />
						</summary>
						<div
							class="dropdown-content z-20 mt-2 w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-xl"
						>
							<input
								class="input input-bordered input-xs mb-2 w-full"
								type="search"
								placeholder="Filter blocks..."
								bind:value={childBlockQuery}
							/>
							<ul class="menu max-h-64 overflow-auto p-0">
								{#each filteredChildBlocks as block (block.id)}
									<li>
										<button type="button" onclick={() => addNestedBlock(block.id)}>
											{block.label}
										</button>
									</li>
								{:else}
									<li class="px-3 py-2 text-xs opacity-60">No matching blocks</li>
								{/each}
							</ul>
						</div>
					</details>
				{/if}
			</div>
			{#if hasChildren}
				<ul class="uncial-children-list flex flex-col gap-1.5">
					{#each controllerState.containerChildren as child, index (child.key)}
						<li
							class="uncial-child-item flex items-center gap-2 rounded-lg border border-base-300 bg-base-200/50 px-2 py-2"
							class:opacity-60={draggingChildIndex === index}
							data-child-index={index}
							animate:flip={{ duration: 120 }}
						>
							<button
								type="button"
								class="btn btn-ghost btn-xs btn-square cursor-grab"
								aria-label="Drag nested block"
								onpointerdown={(event) => startChildDrag(event, index)}
							>
								<DotsSixVerticalIcon size={12} weight="bold" />
							</button>
							<div class="min-w-0 flex-1">
								<span class="text-xs font-bold">{child.label}</span>
								{#if child.summary}
									<span class="ml-1 text-xs opacity-50">{child.summary}</span>
								{/if}
							</div>
							<div class="flex gap-0.5">
								<button
									type="button"
									class="btn btn-ghost btn-xs btn-square"
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
									class="btn btn-ghost btn-xs btn-square"
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
									class="btn btn-ghost btn-xs btn-square text-error"
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
				<p class="text-xs opacity-60">No nested blocks yet.</p>
			{/if}
		</div>
	{/if}
</div>
