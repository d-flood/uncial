import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import type { BlockRegistry, ContentSchema } from '../core/types.js';
import type { ActiveBlockSelection } from './attributesController.js';
export interface ContainerChildOps {
    move(fromIndex: number, toIndex: number): boolean;
    insert(blockId: string, attrs?: Record<string, unknown>): boolean;
    remove(index: number): boolean;
}
/**
 * Live view of the controller's mutable context. The ops read the editor,
 * registry and schema lazily (they change on attach/detach) and resolve the
 * currently-open block on demand, so a single ops instance created once at
 * controller construction stays correct across re-attaches.
 */
export interface ContainerChildOpsContext {
    getEditor(): Editor | null;
    getRegistry(): BlockRegistry | null;
    getSchema(): ContentSchema | undefined;
    /** The block the panel is currently editing, re-resolved against the live doc. */
    resolveActiveBlock(): ActiveBlockSelection | null;
    /** Dispatch a transaction with `bindEditor`'s auto-open suppressed for its echo. */
    dispatch(tr: Transaction): void;
    /** Re-derive controller state after the doc changed (an 'update' sync). */
    sync(): void;
}
/**
 * Add / move / remove children of the container block the panel is editing.
 * Each op mutates only the document (never the controller store directly) and
 * then asks the controller to re-sync, so container-child edits produce exactly
 * one state notification — the same as before this was extracted.
 */
export declare function createContainerChildOps(ctx: ContainerChildOpsContext): ContainerChildOps;
