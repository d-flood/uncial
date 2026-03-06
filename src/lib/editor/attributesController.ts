import type { Editor } from '@tiptap/core';
import { get, writable, type Readable } from 'svelte/store';
import type { BlockDefinition, BlockRegistry, ContentSchema } from '../core/types.js';
import { getBlockDefaultAttrs } from '../shared/tiptap.js';

export type BlockAttributeMode = 'insert' | 'edit' | null;

export interface ActiveBlockSelection {
	id: string;
	attrs: Record<string, unknown>;
	pos: number;
}

export interface BlockAttributesState {
	open: boolean;
	mode: BlockAttributeMode;
	selectedBlockId: string;
	draftAttrs: Record<string, string>;
	activeBlock: ActiveBlockSelection | null;
	allowedBlockIds: string[];
}

export interface BlockAttributesController extends Readable<BlockAttributesState> {
	attach(editor: Editor, registry: BlockRegistry, schema?: ContentSchema): void;
	detach(): void;
	openAttributes(blockId?: string): void;
	closeAttributes(): void;
	selectBlock(blockId: string): void;
	setDraftAttr(name: string, value: string): void;
	commit(): boolean;
	insertBlock(blockId: string, attrs?: Record<string, unknown>): boolean;
	updateSelectedBlockAttrs(blockId: string, partialAttrs: Record<string, unknown>): boolean;
	canEditSelectedBlock(blockId: string): boolean;
	getActiveBlock(): ActiveBlockSelection | null;
	syncFromSelection(): void;
}

const INITIAL_STATE: BlockAttributesState = {
	open: false,
	mode: null,
	selectedBlockId: '',
	draftAttrs: {},
	activeBlock: null,
	allowedBlockIds: []
};

function stringifyAttrs(attrs: Record<string, unknown>): Record<string, string> {
	return Object.fromEntries(
		Object.entries(attrs).map(([key, value]) => [key, String(value ?? '')])
	);
}

function findActiveBlock(
	editor: Editor | null,
	registry: BlockRegistry | null
): ActiveBlockSelection | null {
	if (!editor || !registry) return null;

	const selection = editor.state.selection as {
		from: number;
		node?: { type?: { name?: string }; attrs?: Record<string, unknown> };
		$from?: {
			nodeAfter?: { type?: { name?: string }; attrs?: Record<string, unknown> };
			nodeBefore?: { type?: { name?: string }; attrs?: Record<string, unknown> };
		};
	};

	const selectedNode =
		selection.node ?? selection.$from?.nodeAfter ?? selection.$from?.nodeBefore ?? null;

	const nodeType = selectedNode?.type?.name;
	if (!nodeType || !registry.has(nodeType)) return null;

	return {
		id: nodeType,
		attrs: selectedNode?.attrs ?? {},
		pos: selection.from
	};
}

export function createBlockAttributesController(): BlockAttributesController {
	const state = writable<BlockAttributesState>(INITIAL_STATE);

	let editor: Editor | null = null;
	let registry: BlockRegistry | null = null;
	let schema: ContentSchema | undefined = undefined;

	function allowedBlocks(): string[] {
		if (!registry) return [];
		return registry.blocks
			.map((block: BlockDefinition) => block.id)
			.filter((id: string) => !schema || schema.allowedBlocks.has(id));
	}

	function resetDraftForBlock(blockId: string): void {
		if (!registry || !blockId) {
			state.update((current) => ({ ...current, draftAttrs: {} }));
			return;
		}

		const block = registry.get(blockId);
		state.update((current) => ({
			...current,
			draftAttrs: block ? stringifyAttrs(getBlockDefaultAttrs(block)) : {}
		}));
	}

	function syncFromSelection(): void {
		const active = findActiveBlock(editor, registry);
		state.update((current) => {
			const nextMode =
				current.open && current.selectedBlockId && active?.id === current.selectedBlockId
					? 'edit'
					: current.open && current.selectedBlockId
						? 'insert'
						: current.mode;

			const nextDraft =
				nextMode === 'edit' && active ? stringifyAttrs(active.attrs) : current.draftAttrs;

			return {
				...current,
				activeBlock: active,
				mode: nextMode,
				draftAttrs: nextDraft
			};
		});
	}

	function selectBlock(blockId: string): void {
		const ids = allowedBlocks();
		const isAllowed = ids.includes(blockId);
		const nextId = isAllowed ? blockId : '';

		state.update((current) => ({
			...current,
			selectedBlockId: nextId,
			mode: null
		}));
		resetDraftForBlock(nextId);
	}

	function openAttributes(blockId?: string): void {
		if (blockId !== undefined) {
			selectBlock(blockId);
		}

		const current = get(state);
		let selectedBlockId = current.selectedBlockId;

		if (!selectedBlockId && current.activeBlock?.id) {
			selectedBlockId = current.activeBlock.id;
			selectBlock(selectedBlockId);
		}

		if (!selectedBlockId) return;

		const active = findActiveBlock(editor, registry);
		const mode: BlockAttributeMode = active?.id === selectedBlockId ? 'edit' : 'insert';
		const draftAttrs =
			mode === 'edit' && active ? stringifyAttrs(active.attrs) : get(state).draftAttrs;

		state.update((next) => ({
			...next,
			open: true,
			selectedBlockId,
			mode,
			draftAttrs
		}));
	}

	function closeAttributes(): void {
		state.update((current) => ({ ...current, open: false, mode: null }));
	}

	function setDraftAttr(name: string, value: string): void {
		state.update((current) => ({
			...current,
			draftAttrs: {
				...current.draftAttrs,
				[name]: value
			}
		}));
	}

	function canEditSelectedBlock(blockId: string): boolean {
		return findActiveBlock(editor, registry)?.id === blockId;
	}

	function insertBlock(blockId: string, attrs: Record<string, unknown> = {}): boolean {
		if (!editor || !registry?.has(blockId)) return false;
		return editor
			.chain()
			.focus()
			.insertContent({
				type: blockId,
				attrs
			})
			.run();
	}

	function updateSelectedBlockAttrs(
		blockId: string,
		partialAttrs: Record<string, unknown>
	): boolean {
		if (!editor || !canEditSelectedBlock(blockId)) return false;
		return editor.chain().focus().updateAttributes(blockId, partialAttrs).run();
	}

	function commit(): boolean {
		const current = get(state);
		if (!current.selectedBlockId) return false;

		const attrs = current.draftAttrs;
		const ok =
			current.mode === 'edit' && canEditSelectedBlock(current.selectedBlockId)
				? updateSelectedBlockAttrs(current.selectedBlockId, attrs)
				: insertBlock(current.selectedBlockId, attrs);

		if (!ok) return false;

		closeAttributes();
		syncFromSelection();
		return true;
	}

	function attach(
		nextEditor: Editor,
		nextRegistry: BlockRegistry,
		nextSchema?: ContentSchema
	): void {
		editor = nextEditor;
		registry = nextRegistry;
		schema = nextSchema;
		state.update((current) => ({
			...current,
			allowedBlockIds: allowedBlocks()
		}));
		syncFromSelection();
	}

	function detach(): void {
		editor = null;
		registry = null;
		schema = undefined;
		state.set(INITIAL_STATE);
	}

	function getActiveBlock(): ActiveBlockSelection | null {
		return findActiveBlock(editor, registry);
	}

	return {
		subscribe: state.subscribe,
		attach,
		detach,
		openAttributes,
		closeAttributes,
		selectBlock,
		setDraftAttr,
		commit,
		insertBlock,
		updateSelectedBlockAttrs,
		canEditSelectedBlock,
		getActiveBlock,
		syncFromSelection
	};
}
