import type { Editor } from '@tiptap/core';
import { get, writable, type Readable } from 'svelte/store';
import { NodeSelection, type Transaction } from '@tiptap/pm/state';
import type { BlockDefinition, BlockRegistry, ContentSchema } from '../core/types.js';
import {
	parseBlockDraftAttributes,
	toAttributeDraftValues,
	type AttributeDefinition
} from '../core/attributes.js';
import { CODE_BLOCK_ID } from '../shared/codeBlockAttributes.js';
import { createAttributeTargets, type AttributeTargets } from './attributeTargets.js';
import { createLinkController, getActiveLinkAttrs } from './linkController.js';
import { createContainerChildOps } from './containerChildOps.js';

export type BlockAttributeMode = 'insert' | 'edit' | null;

export interface LinkAttributes {
	href?: string | null;
	target?: string | null;
	rel?: string | null;
	title?: string | null;
	class?: string | null;
}

export interface LinkAttributesState {
	open: boolean;
	attrs: LinkAttributes;
}

export interface ActiveBlockSelection {
	id: string;
	attrs: Record<string, unknown>;
	pos: number;
}

export interface ContainerChildInfo {
	index: number;
	key: string;
	blockId: string;
	label: string;
	summary: string;
}

export interface BlockAttributesState {
	open: boolean;
	mode: BlockAttributeMode;
	selectedBlockId: string;
	draftAttrs: Record<string, unknown>;
	validationErrors: Record<string, string>;
	activeBlock: ActiveBlockSelection | null;
	allowedBlockIds: string[];
	containerChildren: ContainerChildInfo[];
	link: LinkAttributesState;
}

export interface BlockAttributesController extends Readable<BlockAttributesState> {
	attach(editor: Editor, registry: BlockRegistry, schema?: ContentSchema): void;
	detach(): void;
	openAttributes(blockId?: string): void;
	openAttributesAt(pos: number): void;
	closeAttributes(): void;
	openLinkAttributes(): void;
	closeLinkAttributes(): void;
	setLinkAttr(name: keyof LinkAttributes, value: string | null): void;
	commitLinkAttributes(): boolean;
	removeLink(): boolean;
	selectBlock(blockId: string): void;
	setDraftAttr(name: string, value: unknown): void;
	commit(): boolean;
	insertBlock(blockId: string, attrs?: Record<string, unknown>): boolean;
	updateSelectedBlockAttrs(blockId: string, partialAttrs: Record<string, unknown>): boolean;
	canEditSelectedBlock(blockId: string): boolean;
	getActiveBlock(): ActiveBlockSelection | null;
	syncFromSelection(source?: 'selection' | 'update'): void;
	isSelectionAutoOpenSuppressed(): boolean;
	moveContainerChild(fromIndex: number, toIndex: number): boolean;
	insertContainerChild(blockId: string, attrs?: Record<string, unknown>): boolean;
	removeActiveBlock(): boolean;
	removeContainerChild(index: number): boolean;
}

interface ParsedDraftAttributes {
	attrs: Record<string, unknown>;
	validationErrors: Record<string, string>;
}

/**
 * The single source of truth for a fresh controller state snapshot. Every
 * consumer that needs an initial `BlockAttributesState` (the controller store,
 * `bindEditor`, and the Svelte panels) imports this factory rather than
 * duplicating the literal, so the shape can never drift between them.
 */
export function createInitialState(): BlockAttributesState {
	return {
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
	};
}

function findActiveBlock(
	editor: Editor | null,
	targets: AttributeTargets
): ActiveBlockSelection | null {
	if (!editor) return null;

	const selection = editor.state.selection as Editor['state']['selection'] & {
		node?: { type?: { name?: string }; attrs?: Record<string, unknown> };
	};

	const selectedNode = selection.node;
	const selectedType = selectedNode?.type?.name;
	if (selectedType && targets.has(selectedType)) {
		return {
			id: selectedType,
			attrs: selectedNode?.attrs ?? {},
			pos: selection.from
		};
	}

	for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
		const node = selection.$from.node(depth);
		const nodeType = node.type.name;
		if (!targets.has(nodeType)) {
			continue;
		}

		return {
			id: nodeType,
			attrs: node.attrs ?? {},
			pos: selection.$from.before(depth)
		};
	}

	if (selection.$from.depth > 0) return null;

	const adjacentNode = selection.$from.nodeAfter ?? selection.$from.nodeBefore ?? null;
	const adjacentType = adjacentNode?.type?.name;
	if (!adjacentType || !targets.has(adjacentType)) return null;

	return {
		id: adjacentType,
		attrs: adjacentNode?.attrs ?? {},
		pos: selection.from
	};
}

function findBlockAt(
	editor: Editor | null,
	targets: AttributeTargets,
	pos: number
): ActiveBlockSelection | null {
	if (!editor || pos < 0 || pos > editor.state.doc.content.size) return null;
	const node = editor.state.doc.nodeAt(pos);
	if (!node || !targets.has(node.type.name)) return null;

	return {
		id: node.type.name,
		attrs: node.attrs ?? {},
		pos
	};
}

export function createBlockAttributesController(): BlockAttributesController {
	const state = writable<BlockAttributesState>(createInitialState());

	let editor: Editor | null = null;
	let registry: BlockRegistry | null = null;
	let schema: ContentSchema | undefined = undefined;
	// Attribute-metadata resolver over the current registry plus the virtual code
	// block; rebuilt whenever the registry changes (attach/detach).
	let targets: AttributeTargets = createAttributeTargets(null);
	// One-shot suppression of `bindEditor`'s auto-open behavior. The controller
	// dispatches its own transactions (selecting a block, mutating a container's
	// children); Tiptap fires the resulting `selectionUpdate`/`update` events
	// SYNCHRONOUSLY inside `view.dispatch`, so a flag that is raised for the
	// duration of the dispatch and lowered immediately after covers exactly those
	// self-triggered echo events and cannot wedge (the `finally` always clears it).
	let suppressAutoOpen = false;
	let applyingDraftAttrs = false;

	const link = createLinkController(() => editor, state);
	const containerOps = createContainerChildOps({
		getEditor: () => editor,
		getRegistry: () => registry,
		getSchema: () => schema,
		resolveActiveBlock: () => resolveActiveBlock(get(state)),
		dispatch: (tr) => dispatchSuppressingAutoOpen(tr),
		sync: () => syncFromSelection('update')
	});

	function dispatchSuppressingAutoOpen(tr: Transaction): void {
		if (!editor) return;
		const previous = suppressAutoOpen;
		suppressAutoOpen = true;
		try {
			editor.view.dispatch(tr);
		} finally {
			suppressAutoOpen = previous;
		}
	}

	function allowedBlocks(): string[] {
		if (!registry) return [];
		return registry.blocks
			.map((block: BlockDefinition) => block.id)
			.filter((id: string) => !schema || schema.allowedBlocks.has(id));
	}

	function resolveActiveBlock(current: BlockAttributesState): ActiveBlockSelection | null {
		return current.activeBlock ? findBlockAt(editor, targets, current.activeBlock.pos) : null;
	}

	function resetDraftForBlock(blockId: string): void {
		if (!registry || !blockId) {
			state.update((current) => ({ ...current, draftAttrs: {} }));
			return;
		}

		const block = targets.get(blockId);
		state.update((current) => ({
			...current,
			draftAttrs: block ? toAttributeDraftValues(block, targets.defaultAttrs(blockId)) : {},
			validationErrors: {}
		}));
	}

	function getContainerChildrenInfo(
		activeOverride?: ActiveBlockSelection | null
	): ContainerChildInfo[] {
		if (!editor || !registry) return [];
		const active = activeOverride ?? findActiveBlock(editor, targets);
		if (!active) return [];
		const block = registry.get(active.id);
		if (!block || !block.content) return [];

		const node = editor.state.doc.nodeAt(active.pos);
		if (!node) return [];

		const children: ContainerChildInfo[] = [];
		node.forEach((child, offset, index) => {
			const childBlock = registry!.get(child.type.name);
			const label = childBlock?.label ?? child.type.name;
			let summary = '';
			const attrs = child.attrs as Record<string, unknown> | null;
			if (attrs) {
				for (const key of ['title', 'name', 'label', 'heading']) {
					const val = attrs[key];
					if (typeof val === 'string' && val.trim()) {
						summary = val.trim().length > 40 ? val.trim().slice(0, 40) + '…' : val.trim();
						break;
					}
				}
			}
			const childAttrs = child.attrs as Record<string, unknown> | null;
			const stableAttr = childAttrs?.id ?? childAttrs?.key ?? childAttrs?.name ?? childAttrs?.title;
			children.push({
				index,
				key: `${child.type.name}:${String(stableAttr ?? '')}:${offset}:${index}`,
				blockId: child.type.name,
				label,
				summary
			});
		});
		return children;
	}

	function syncFromSelection(source: 'selection' | 'update' = 'selection'): void {
		const active = findActiveBlock(editor, targets);
		const activeLinkAttrs = getActiveLinkAttrs(editor);
		state.update((current) => {
			const activeBlock = active ? targets.get(active.id) : undefined;
			const activeIsCodeBlock = active?.id === CODE_BLOCK_ID;
			const shouldCloseOnSelection = Boolean(
				source === 'selection' &&
				current.open &&
				current.mode === 'edit' &&
				!activeLinkAttrs &&
				(!active || active.id !== current.selectedBlockId)
			);
			if (shouldCloseOnSelection) {
				return {
					...current,
					open: false,
					mode: null,
					activeBlock: null,
					containerChildren: [],
					validationErrors: {}
				};
			}

			const currentActive = resolveActiveBlock(current);
			const currentActiveIsContainer = Boolean(
				currentActive && targets.get(currentActive.id)?.content
			);
			const shouldPreserveContainerOnUpdate = Boolean(
				source === 'update' && current.open && current.mode === 'edit' && currentActiveIsContainer
			);
			const shouldEditActiveAtom = Boolean(
				(current.open || activeIsCodeBlock) &&
				active &&
				activeBlock &&
				!activeBlock.content &&
				!shouldPreserveContainerOnUpdate
			);
			const explicitContainerOpen = Boolean(
				current.open &&
				current.mode === 'edit' &&
				currentActiveIsContainer &&
				(!shouldEditActiveAtom || shouldPreserveContainerOnUpdate)
			);
			const selectedBlockId = explicitContainerOpen
				? currentActive!.id
				: shouldEditActiveAtom
					? active!.id
					: current.selectedBlockId;
			const nextActive = explicitContainerOpen ? currentActive : active;
			const nextMode =
				explicitContainerOpen ||
				shouldEditActiveAtom ||
				(current.open && selectedBlockId && active?.id === selectedBlockId)
					? 'edit'
					: current.open && selectedBlockId
						? 'insert'
						: current.mode;

			const shouldPreserveDraftAttrs = Boolean(
				source === 'update' && applyingDraftAttrs && current.open && current.mode === 'edit'
			);
			const nextDraft = shouldPreserveDraftAttrs
				? current.draftAttrs
				: nextMode === 'edit' && active && activeBlock && active.id === selectedBlockId
					? toAttributeDraftValues(activeBlock, active.attrs)
					: explicitContainerOpen && currentActive && targets.get(currentActive.id)
						? toAttributeDraftValues(targets.get(currentActive.id)!, currentActive.attrs)
						: current.draftAttrs;

			return {
				...current,
				open: current.open || activeIsCodeBlock,
				selectedBlockId,
				activeBlock: nextActive,
				mode: nextMode,
				draftAttrs: nextDraft,
				// A write-through from setDraftAttr echoes back here as an 'update';
				// wiping errors then would hide a still-invalid sibling field's error
				// right after a valid edit to another field.
				validationErrors:
					nextMode === 'edit' && !shouldPreserveDraftAttrs ? {} : current.validationErrors,
				containerChildren: getContainerChildrenInfo(nextActive),
				link: activeLinkAttrs ? { open: true, attrs: activeLinkAttrs } : { open: false, attrs: {} }
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
			mode: null,
			validationErrors: {}
		}));
		resetDraftForBlock(nextId);
	}

	function openAttributes(blockId?: string): void {
		if (blockId !== undefined) {
			selectBlock(blockId);
		}

		const current = get(state);
		const active = findActiveBlock(editor, targets);
		let selectedBlockId = blockId ?? active?.id ?? current.selectedBlockId;

		if (!selectedBlockId && current.activeBlock?.id) {
			selectedBlockId = current.activeBlock.id;
			selectBlock(selectedBlockId);
		}

		if (!selectedBlockId) return;

		const mode: BlockAttributeMode = active?.id === selectedBlockId ? 'edit' : 'insert';
		const activeTarget = active ? targets.get(active.id) : null;
		const draftAttrs =
			mode === 'edit' && active && activeTarget
				? toAttributeDraftValues(activeTarget, active.attrs)
				: get(state).draftAttrs;

		state.update((next) => ({
			...next,
			open: true,
			selectedBlockId,
			mode,
			draftAttrs,
			validationErrors: {}
		}));
	}

	function openAttributesAt(pos: number): void {
		const active = findBlockAt(editor, targets, pos);
		if (!active || !registry) return;
		const block = targets.get(active.id);
		if (!block) return;

		if (editor) {
			dispatchSuppressingAutoOpen(
				editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, active.pos))
			);
		}

		state.update((current) => ({
			...current,
			open: true,
			mode: 'edit',
			selectedBlockId: active.id,
			activeBlock: active,
			draftAttrs: toAttributeDraftValues(block, active.attrs),
			validationErrors: {},
			containerChildren: getContainerChildrenInfo(active)
		}));
	}

	function closeAttributes(): void {
		state.update((current) => ({
			...current,
			open: false,
			mode: null,
			validationErrors: {}
		}));
	}

	function parseAndValidateDraft(
		block: AttributeDefinition,
		draftAttrs: Record<string, unknown>
	): ParsedDraftAttributes {
		const attrs = parseBlockDraftAttributes(block, draftAttrs);
		const validationErrors = Object.fromEntries(
			Object.entries(block.attributes).flatMap(([name, spec]) => {
				const value = attrs[name];
				if ((value === undefined || value === null || value === '') && spec.required) {
					return [[name, 'Required']];
				}
				if (spec.validate && !spec.validate(value)) {
					return [[name, 'Invalid value']];
				}
				return [];
			})
		);

		return { attrs, validationErrors };
	}

	function setDraftAttr(name: string, value: unknown): void {
		const current = get(state);
		const nextDraftAttrs = {
			...current.draftAttrs,
			[name]: value
		};

		state.update((draft) => ({
			...draft,
			draftAttrs: nextDraftAttrs,
			validationErrors: {
				...draft.validationErrors,
				[name]: ''
			}
		}));

		if (current.mode !== 'edit' || !current.activeBlock || !current.selectedBlockId) return;

		const block = targets.get(current.selectedBlockId);
		if (!block) return;

		const { attrs, validationErrors } = parseAndValidateDraft(block, nextDraftAttrs);
		state.update((draft) => ({ ...draft, validationErrors: { [name]: '', ...validationErrors } }));
		// Only the EDITED field gates its own write-through. An invalid sibling
		// field (a cleared required title, an image block whose required image is
		// not chosen yet) must not silently block live edits to other fields —
		// that reads as "the attribute editor stopped working".
		if (validationErrors[name]) return;

		const active = findBlockAt(editor, targets, current.activeBlock.pos);
		if (!editor || active?.id !== current.selectedBlockId) return;

		const node = editor.state.doc.nodeAt(active.pos);
		if (!node) return;

		// Write valid fields through; fields whose draft is invalid keep the
		// node's current (last valid) values.
		const appliedAttrs = { ...attrs };
		for (const invalidName of Object.keys(validationErrors)) {
			appliedAttrs[invalidName] = node.attrs?.[invalidName];
		}

		applyingDraftAttrs = true;
		try {
			editor.view.dispatch(editor.state.tr.setNodeMarkup(active.pos, undefined, appliedAttrs));
		} finally {
			applyingDraftAttrs = false;
		}
	}

	function canEditSelectedBlock(blockId: string): boolean {
		const current = get(state);
		const explicitActive = resolveActiveBlock(current);
		return (explicitActive ?? findActiveBlock(editor, targets))?.id === blockId;
	}

	function insertBlock(blockId: string, attrs: Record<string, unknown> = {}): boolean {
		if (!editor || !registry?.has(blockId)) return false;
		const block = registry.get(blockId);
		if (!block) return false;

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
		const block = targets.get(current.selectedBlockId);
		if (!block) return false;

		const { attrs, validationErrors } = parseAndValidateDraft(block, current.draftAttrs);

		if (Object.keys(validationErrors).length > 0) {
			state.update((draft) => ({ ...draft, validationErrors }));
			return false;
		}

		let ok = false;
		if (current.mode === 'edit' && current.activeBlock) {
			const active = findBlockAt(editor, targets, current.activeBlock.pos);
			if (editor && active?.id === current.selectedBlockId) {
				const node = editor.state.doc.nodeAt(active.pos);
				if (node) {
					editor.view.dispatch(editor.state.tr.setNodeMarkup(active.pos, undefined, attrs));
					ok = true;
				}
			}
		} else {
			ok = insertBlock(current.selectedBlockId, attrs);
		}

		if (!ok) return false;

		closeAttributes();
		syncFromSelection('update');
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
		targets = createAttributeTargets(nextRegistry);
		state.update((current) => ({
			...current,
			allowedBlockIds: allowedBlocks()
		}));
		syncFromSelection('update');
	}

	function detach(): void {
		editor = null;
		registry = null;
		schema = undefined;
		targets = createAttributeTargets(null);
		state.set(createInitialState());
	}

	function getActiveBlock(): ActiveBlockSelection | null {
		return findActiveBlock(editor, targets);
	}

	function isSelectionAutoOpenSuppressed(): boolean {
		return suppressAutoOpen;
	}

	function removeActiveBlock(): boolean {
		if (!editor || !registry) return false;
		const current = get(state);
		const active = resolveActiveBlock(current);
		if (!active) return false;
		const node = editor.state.doc.nodeAt(active.pos);
		if (!node) return false;

		editor.view.dispatch(editor.state.tr.delete(active.pos, active.pos + node.nodeSize));
		closeAttributes();
		syncFromSelection('update');
		return true;
	}

	return {
		subscribe: state.subscribe,
		attach,
		detach,
		openAttributes,
		openAttributesAt,
		closeAttributes,
		openLinkAttributes: link.open,
		closeLinkAttributes: link.close,
		setLinkAttr: link.setAttr,
		commitLinkAttributes: link.commit,
		removeLink: link.remove,
		selectBlock,
		setDraftAttr,
		commit,
		insertBlock,
		updateSelectedBlockAttrs,
		canEditSelectedBlock,
		getActiveBlock,
		syncFromSelection,
		isSelectionAutoOpenSuppressed,
		moveContainerChild: containerOps.move,
		insertContainerChild: containerOps.insert,
		removeActiveBlock,
		removeContainerChild: containerOps.remove
	};
}
