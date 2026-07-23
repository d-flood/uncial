import type { Editor } from '@tiptap/core';
import { type Readable } from 'svelte/store';
import type { BlockRegistry, ContentSchema } from '../core/types.js';
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
/**
 * The single source of truth for a fresh controller state snapshot. Every
 * consumer that needs an initial `BlockAttributesState` (the controller store,
 * `bindEditor`, and the Svelte panels) imports this factory rather than
 * duplicating the literal, so the shape can never drift between them.
 */
export declare function createInitialState(): BlockAttributesState;
export declare function createBlockAttributesController(): BlockAttributesController;
