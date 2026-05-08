import type { Editor } from '@tiptap/core';
import { get, writable, type Readable } from 'svelte/store';
import { NodeSelection } from '@tiptap/pm/state';
import type { BlockDefinition, BlockRegistry, ContentSchema } from '../core/types.js';
import { getBlockDefaultAttrs } from '../shared/tiptap.js';
import { parseBlockDraftAttributes, toAttributeDraftValues } from '../core/attributes.js';

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
	removeActiveBlock(): boolean;
	removeContainerChild(index: number): boolean;
}

interface ParsedDraftAttributes {
	attrs: Record<string, unknown>;
	validationErrors: Record<string, string>;
}

const INITIAL_STATE: BlockAttributesState = {
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

function getActiveLinkAttrs(editor: Editor | null): LinkAttributes | null {
	if (!editor?.isActive('link')) return null;
	return editor.getAttributes('link') as LinkAttributes;
}

function findActiveBlock(
	editor: Editor | null,
	registry: BlockRegistry | null
): ActiveBlockSelection | null {
	if (!editor || !registry) return null;

	const selection = editor.state.selection as Editor['state']['selection'] & {
		node?: { type?: { name?: string }; attrs?: Record<string, unknown> };
	};

	const selectedNode = selection.node;
	const selectedType = selectedNode?.type?.name;
	if (selectedType && registry.has(selectedType)) {
		return {
			id: selectedType,
			attrs: selectedNode?.attrs ?? {},
			pos: selection.from
		};
	}

	for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
		const node = selection.$from.node(depth);
		const nodeType = node.type.name;
		if (!registry.has(nodeType)) {
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
	if (!adjacentType || !registry.has(adjacentType)) return null;

	return {
		id: adjacentType,
		attrs: adjacentNode?.attrs ?? {},
		pos: selection.from
	};
}

function findBlockAt(
	editor: Editor | null,
	registry: BlockRegistry | null,
	pos: number
): ActiveBlockSelection | null {
	if (!editor || !registry || pos < 0 || pos > editor.state.doc.content.size) return null;
	const node = editor.state.doc.nodeAt(pos);
	if (!node || !registry.has(node.type.name)) return null;

	return {
		id: node.type.name,
		attrs: node.attrs ?? {},
		pos
	};
}

export function createBlockAttributesController(): BlockAttributesController {
	const state = writable<BlockAttributesState>(INITIAL_STATE);

	let editor: Editor | null = null;
	let registry: BlockRegistry | null = null;
	let schema: ContentSchema | undefined = undefined;
	let explicitContainerOpenUntil = 0;
	let applyingDraftAttrs = false;

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
			draftAttrs: block ? toAttributeDraftValues(block, getBlockDefaultAttrs(block)) : {},
			validationErrors: {}
		}));
	}

	function getContainerChildrenInfo(
		activeOverride?: ActiveBlockSelection | null
	): ContainerChildInfo[] {
		if (!editor || !registry) return [];
		const active = activeOverride ?? findActiveBlock(editor, registry);
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
		const active = findActiveBlock(editor, registry);
		const activeLinkAttrs = getActiveLinkAttrs(editor);
		state.update((current) => {
			const activeBlock = active ? registry?.get(active.id) : undefined;
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

			const currentActive = current.activeBlock
				? findBlockAt(editor, registry, current.activeBlock.pos)
				: null;
			const currentActiveIsContainer = Boolean(
				currentActive && registry?.get(currentActive.id)?.content
			);
			const shouldPreserveContainerOnUpdate = Boolean(
				source === 'update' && current.open && current.mode === 'edit' && currentActiveIsContainer
			);
			const shouldEditActiveAtom = Boolean(
				current.open &&
				active &&
				activeBlock &&
				!activeBlock.content &&
				!shouldPreserveContainerOnUpdate
			);
			const explicitContainerOpen = Boolean(
				current.open &&
				current.mode === 'edit' &&
				currentActiveIsContainer &&
				(!shouldEditActiveAtom ||
					shouldPreserveContainerOnUpdate ||
					Date.now() < explicitContainerOpenUntil)
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
					: explicitContainerOpen && currentActive && registry?.get(currentActive.id)
						? toAttributeDraftValues(registry.get(currentActive.id)!, currentActive.attrs)
						: current.draftAttrs;

			return {
				...current,
				selectedBlockId,
				activeBlock: nextActive,
				mode: nextMode,
				draftAttrs: nextDraft,
				validationErrors: nextMode === 'edit' ? {} : current.validationErrors,
				containerChildren: getContainerChildrenInfo(nextActive),
				link: activeLinkAttrs
					? { open: true, attrs: activeLinkAttrs }
					: { open: false, attrs: {} }
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
		const active = findActiveBlock(editor, registry);
		let selectedBlockId = blockId ?? active?.id ?? current.selectedBlockId;

		if (!selectedBlockId && current.activeBlock?.id) {
			selectedBlockId = current.activeBlock.id;
			selectBlock(selectedBlockId);
		}

		if (!selectedBlockId) return;

		const mode: BlockAttributeMode = active?.id === selectedBlockId ? 'edit' : 'insert';
		const draftAttrs =
			mode === 'edit' && active && registry?.get(active.id)
				? toAttributeDraftValues(registry.get(active.id)!, active.attrs)
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
		const active = findBlockAt(editor, registry, pos);
		if (!active || !registry) return;
		const block = registry.get(active.id);
		if (!block) return;
		explicitContainerOpenUntil = block.content ? Date.now() + 300 : 0;

		if (editor) {
			const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, active.pos));
			editor.view.dispatch(tr);
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

	function openLinkAttributes(): void {
		if (!editor) return;
		const attrs = getActiveLinkAttrs(editor) ?? { href: '' };
		state.update((current) => ({
			...current,
			link: { open: true, attrs }
		}));
	}

	function closeLinkAttributes(): void {
		state.update((current) => ({
			...current,
			link: { open: false, attrs: {} }
		}));
	}

	function setLinkAttr(name: keyof LinkAttributes, value: string | null): void {
		state.update((current) => ({
			...current,
			link: {
				open: true,
				attrs: {
					...current.link.attrs,
					[name]: value
				}
			}
		}));
	}

	function commitLinkAttributes(): boolean {
		if (!editor) return false;
		const attrs = get(state).link.attrs;
		const href = attrs.href?.trim();
		if (!href) return false;

		return editor
			.chain()
			.focus()
			.extendMarkRange('link')
			.setMark('link', {
				...attrs,
				href,
				target: attrs.target || null,
				rel: attrs.rel || null,
				title: attrs.title?.trim() || null,
				class: attrs.class?.trim() || null
			})
			.run();
	}

	function removeLink(): boolean {
		if (!editor) return false;
		const ok = editor.chain().focus().extendMarkRange('link').unsetLink().run();
		if (ok) closeLinkAttributes();
		return ok;
	}

	function parseAndValidateDraft(
		block: BlockDefinition,
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

		const block = registry?.get(current.selectedBlockId);
		if (!block) return;

		const { attrs, validationErrors } = parseAndValidateDraft(block, nextDraftAttrs);
		if (Object.keys(validationErrors).length > 0) {
			state.update((draft) => ({ ...draft, validationErrors }));
			return;
		}

		const active = findBlockAt(editor, registry, current.activeBlock.pos);
		if (!editor || active?.id !== current.selectedBlockId) return;

		const node = editor.state.doc.nodeAt(active.pos);
		if (!node) return;

		applyingDraftAttrs = true;
		try {
			editor.view.dispatch(editor.state.tr.setNodeMarkup(active.pos, undefined, attrs));
		} finally {
			applyingDraftAttrs = false;
		}
	}

	function canEditSelectedBlock(blockId: string): boolean {
		const current = get(state);
		const explicitActive = current.activeBlock
			? findBlockAt(editor, registry, current.activeBlock.pos)
			: null;
		return (explicitActive ?? findActiveBlock(editor, registry))?.id === blockId;
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
		const block = registry?.get(current.selectedBlockId);
		if (!block) return false;

		const { attrs, validationErrors } = parseAndValidateDraft(block, current.draftAttrs);

		if (Object.keys(validationErrors).length > 0) {
			state.update((draft) => ({ ...draft, validationErrors }));
			return false;
		}

		let ok = false;
		if (current.mode === 'edit' && current.activeBlock) {
			const active = findBlockAt(editor, registry, current.activeBlock.pos);
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
		state.set(INITIAL_STATE);
	}

	function getActiveBlock(): ActiveBlockSelection | null {
		return findActiveBlock(editor, registry);
	}

	function isSelectionAutoOpenSuppressed(): boolean {
		return Date.now() < explicitContainerOpenUntil;
	}

	function moveContainerChild(fromIndex: number, toIndex: number): boolean {
		if (!editor || !registry || fromIndex === toIndex) return false;
		const current = get(state);
		const active = current.activeBlock
			? findBlockAt(editor, registry, current.activeBlock.pos)
			: null;
		if (!active) return false;
		const block = registry.get(active.id);
		if (!block || !block.content) return false;

		const node = editor.state.doc.nodeAt(active.pos);
		if (!node) return false;

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const children: any[] = [];
		node.forEach((child) => children.push(child));

		if (
			fromIndex < 0 ||
			fromIndex >= children.length ||
			toIndex < 0 ||
			toIndex >= children.length
		) {
			return false;
		}

		const [moved] = children.splice(fromIndex, 1);
		children.splice(toIndex, 0, moved);

		const { tr } = editor.state;
		const contentStart = active.pos + 1;
		const contentEnd = active.pos + node.nodeSize - 1;

		explicitContainerOpenUntil = Date.now() + 1000;
		tr.replaceWith(contentStart, contentEnd, children);
		editor.view.dispatch(tr);
		syncFromSelection('update');
		return true;
	}

	function removeActiveBlock(): boolean {
		if (!editor || !registry) return false;
		const current = get(state);
		const active = current.activeBlock
			? findBlockAt(editor, registry, current.activeBlock.pos)
			: null;
		if (!active) return false;
		const node = editor.state.doc.nodeAt(active.pos);
		if (!node) return false;

		editor.view.dispatch(editor.state.tr.delete(active.pos, active.pos + node.nodeSize));
		closeAttributes();
		syncFromSelection('update');
		return true;
	}

	function removeContainerChild(index: number): boolean {
		if (!editor || !registry) return false;
		const current = get(state);
		const active = current.activeBlock
			? findBlockAt(editor, registry, current.activeBlock.pos)
			: null;
		if (!active) return false;
		const block = registry.get(active.id);
		if (!block?.content) return false;
		const node = editor.state.doc.nodeAt(active.pos);
		if (!node || node.childCount <= 1 || index < 0 || index >= node.childCount) return false;

		let childStart = active.pos + 1;
		for (let i = 0; i < index; i += 1) {
			childStart += node.child(i).nodeSize;
		}
		const child = node.child(index);
		explicitContainerOpenUntil = Date.now() + 1000;
		editor.view.dispatch(editor.state.tr.delete(childStart, childStart + child.nodeSize));
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
		openLinkAttributes,
		closeLinkAttributes,
		setLinkAttr,
		commitLinkAttributes,
		removeLink,
		selectBlock,
		setDraftAttr,
		commit,
		insertBlock,
		updateSelectedBlockAttrs,
		canEditSelectedBlock,
		getActiveBlock,
		syncFromSelection,
		isSelectionAutoOpenSuppressed,
		moveContainerChild,
		removeActiveBlock,
		removeContainerChild
	};
}
