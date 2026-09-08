import type { BlockRegistry } from '../core/types.js';
import type { AttributeDefinition } from '../core/attributes.js';
/** A block type's attribute metadata; `content` (when present) marks a container. */
export type AttributeTarget = AttributeDefinition & {
    content?: unknown;
};
/**
 * Resolves attribute metadata for a block type, treating the built-in code block
 * as a *virtual* registry entry. The code block carries editable attributes
 * (its language) but is deliberately NOT part of `registry.blocks`, so it never
 * leaks into block-insertion menus. Routing every `has`/`get`/`defaultAttrs`
 * lookup through here keeps the `codeBlock` special case in one place instead of
 * scattering `if (id === CODE_BLOCK_ID)` branches across the controller.
 */
export interface AttributeTargets {
    /** True for any type that carries editable attributes (a registry block or the code block). */
    has(typeName: string): boolean;
    /** The attribute definition for a type, or null if it has none. */
    get(id: string): AttributeTarget | null;
    /** Default attribute values used to seed an insert-mode draft for a type. */
    defaultAttrs(id: string): Record<string, unknown>;
}
export declare function createAttributeTargets(registry: BlockRegistry | null): AttributeTargets;
