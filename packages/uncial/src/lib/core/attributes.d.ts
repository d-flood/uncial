import type { AttributeInputKind, AttributeOption, AttributeSpec, BlockDefinition } from './types.js';
export type AttributeDefinition = Pick<BlockDefinition, 'attributes'>;
export declare function normalizeAttributeOptions<T>(spec: AttributeSpec<T>): AttributeOption<T>[] | undefined;
export declare function inferAttributeInputKind(spec: AttributeSpec<unknown>): AttributeInputKind;
export declare function coerceAttributeValue<T>(spec: AttributeSpec<T>, value: unknown): T;
export declare function normalizeBlockAttributes(block: AttributeDefinition, attrs?: Record<string, unknown>): Record<string, unknown>;
export declare function serializeAttributeValue<T>(spec: AttributeSpec<T>, value: T): unknown;
export declare function serializeBlockAttributes(block: AttributeDefinition, attrs: Record<string, unknown>): string;
export declare function toAttributeDraftValue(spec: AttributeSpec<unknown>, value: unknown): unknown;
export declare function toAttributeDraftValues(block: AttributeDefinition, attrs: Record<string, unknown>): Record<string, unknown>;
/**
 * @deprecated Alias of {@link normalizeBlockAttributes}. Parsing draft (form)
 * attribute values back into stored values is exactly attribute normalization:
 * both coerce every declared attribute through `coerceAttributeValue`. Kept as a
 * named export for the editor's attributes controller and existing callers.
 */
export declare const parseBlockDraftAttributes: typeof normalizeBlockAttributes;
