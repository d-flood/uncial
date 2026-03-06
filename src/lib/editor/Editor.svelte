<script lang="ts">
	import { Editor as TiptapEditor, type JSONContent } from '@tiptap/core';
	import { onDestroy, onMount } from 'svelte';
	import type { BlockDefinition, BlockRegistry, ContentSchema } from '../core/types.js';
	import { resolveRegistry } from '../core/registry.js';
	import { createEditorExtensions, emptyDocument } from '../shared/tiptap.js';
	import {
		createBlockAttributesController,
		type BlockAttributesController,
		type BlockAttributesState
	} from './attributesController.js';
	import '../styles/uncial.css';

	export let blocks: BlockRegistry | BlockDefinition[] = [];
	export let schema: ContentSchema | undefined = undefined;
	export let json: JSONContent = emptyDocument();
	export let attributesController: BlockAttributesController | null = null;

	let root: HTMLDivElement;
	let editorHost: HTMLDivElement;
	let editor: TiptapEditor | null = null;
	let lastSerialized = '';
	let attrsPopoverId = `uncial-attrs-${Math.random().toString(36).slice(2)}`;
	let attrsPopoverEl: HTMLElement | null = null;
	let controllerUnsubscribe = () => {};
	let controllerState: BlockAttributesState = {
		open: false,
		mode: null,
		selectedBlockId: '',
		draftAttrs: {},
		activeBlock: null,
		allowedBlockIds: []
	};
	const internalController = createBlockAttributesController();

	$: registry = resolveRegistry(blocks);
	$: controller = attributesController ?? internalController;
	$: activeBlocks = registry.blocks.filter((block: BlockDefinition) =>
		controllerState.allowedBlockIds.length
			? controllerState.allowedBlockIds.includes(block.id)
			: !schema || schema.allowedBlocks.has(block.id)
	);
	$: {
		controllerUnsubscribe();
		controllerUnsubscribe = controller.subscribe((state) => {
			controllerState = state;
		});
	}
	$: if (editor) {
		controller.attach(editor, registry, schema);
	}
	$: if (!controllerState.selectedBlockId && attrsPopoverEl?.matches(':popover-open')) {
		attrsPopoverEl.hidePopover();
	}
	$: if (controllerState.open && !attrsPopoverEl?.matches(':popover-open')) {
		attrsPopoverEl?.showPopover();
	}
	$: if (!controllerState.open && attrsPopoverEl?.matches(':popover-open')) {
		attrsPopoverEl.hidePopover();
	}
	$: if (editor && json) {
		const next = JSON.stringify(json);
		if (next !== lastSerialized) {
			editor.commands.setContent(json, { emitUpdate: false });
			lastSerialized = next;
			controller.syncFromSelection();
		}
	}

	function hideAndCloseAttributes(): void {
		if (attrsPopoverEl?.matches(':popover-open')) {
			attrsPopoverEl.hidePopover();
		}
		controller.closeAttributes();
	}

	onMount(() => {
		editor = new TiptapEditor({
			element: editorHost,
			extensions: createEditorExtensions(registry, schema),
			content: json,
			onUpdate: ({ editor: tiptap }) => {
				json = tiptap.getJSON();
				lastSerialized = JSON.stringify(json);
				controller.syncFromSelection();
			},
			onSelectionUpdate: () => {
				controller.syncFromSelection();
			}
		});

		lastSerialized = JSON.stringify(editor.getJSON());
		controller.attach(editor, registry, schema);
	});

	onDestroy(() => {
		controllerUnsubscribe();
		controller.detach();
		editor?.destroy();
		editor = null;
	});

	function toggleBold(): void {
		editor?.chain().focus().toggleBold().run();
	}

	function toggleItalic(): void {
		editor?.chain().focus().toggleItalic().run();
	}

	function setLink(): void {
		if (!editor) return;
		const href = window.prompt('Link URL');
		if (!href) return;
		editor.chain().focus().setLink({ href }).run();
	}

	function unsetLink(): void {
		editor?.chain().focus().unsetLink().run();
	}
</script>

<div class="uncial-editor-shell" bind:this={root}>
	<div class="uncial-toolbar">
		<button type="button" class:is-active={editor?.isActive('bold')} on:click={toggleBold}
			>Bold</button
		>
		<button type="button" class:is-active={editor?.isActive('italic')} on:click={toggleItalic}
			>Italic</button
		>
		<button type="button" class:is-active={editor?.isActive('link')} on:click={setLink}>Link</button
		>
		<button type="button" on:click={unsetLink}>Unlink</button>
		{#if activeBlocks.length > 0}
			<select
				value={controllerState.selectedBlockId}
				on:change={(event) => {
					const target = event.currentTarget as HTMLSelectElement;
					controller.selectBlock(target.value);
				}}
			>
				<option value="">Insert block...</option>
				{#each activeBlocks as block (block.id)}
					<option value={block.id}>{block.label}</option>
				{/each}
			</select>
			<button
				type="button"
				class="uncial-attrs-trigger"
				disabled={!controllerState.selectedBlockId}
				style="anchor-name: --uncial-attrs-anchor;"
				popovertarget={attrsPopoverId}
				on:click={() => controller.openAttributes()}>Block Attributes</button
			>
			<div
				bind:this={attrsPopoverEl}
				id={attrsPopoverId}
				class="uncial-attrs-popover"
				popover="auto"
				style="position-anchor: --uncial-attrs-anchor;"
				on:toggle={(event) => {
					const target = event.currentTarget as HTMLElement;
					if (!target.matches(':popover-open')) {
						controller.closeAttributes();
					}
				}}
			>
				<p class="uncial-attrs-title">
					{controllerState.mode === 'edit' ? 'Edit' : 'Configure'}
					{controllerState.selectedBlockId}
				</p>
				{#each Object.entries(controllerState.draftAttrs) as [name, value] (name)}
					<label class="uncial-attrs-field">
						<span>{name}</span>
						<input
							type="text"
							placeholder={name}
							{value}
							on:input={(event) => {
								const target = event.currentTarget as HTMLInputElement;
								controller.setDraftAttr(name, target.value);
							}}
						/>
					</label>
				{/each}
				<div class="uncial-attrs-actions">
					<button
						type="button"
						on:click={() => {
							const ok = controller.commit();
							if (ok) hideAndCloseAttributes();
						}}>{controllerState.mode === 'edit' ? 'Update Block' : 'Insert Block'}</button
					>
				</div>
			</div>
		{/if}
	</div>
	<div class="uncial-content" bind:this={editorHost}></div>
</div>
