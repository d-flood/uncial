import type { Editor } from '@tiptap/core';
import { type Writable } from 'svelte/store';
import type { BlockAttributesState, LinkAttributes } from './attributesController.js';
/** The link mark's attributes for the current selection, or null if none is active. */
export declare function getActiveLinkAttrs(editor: Editor | null): LinkAttributes | null;
export interface LinkController {
    open(): void;
    close(): void;
    setAttr(name: keyof LinkAttributes, value: string | null): void;
    commit(): boolean;
    remove(): boolean;
}
/**
 * Owns the `link` slice of the shared attributes state. It reads the editor
 * lazily via `getEditor` (the controller's editor reference changes on
 * attach/detach) and mutates only `state.link`, leaving the rest of the
 * snapshot untouched.
 */
export declare function createLinkController(getEditor: () => Editor | null, state: Writable<BlockAttributesState>): LinkController;
