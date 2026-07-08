import type { AttributeOption } from '../core/types.js';

/**
 * Canonical "is this a plain (non-array) object?" guard. Several core/shared
 * modules previously each defined their own copy (`isPlainObject` / `isRecord`);
 * they were byte-identical, so they share this one implementation.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Canonical guard distinguishing an `AttributeOption<T>` object (`{ value, ... }`)
 * from a bare option value. Previously duplicated in `core/attributes.ts` and
 * `core/defineBlock.ts`.
 */
export function isAttributeOption<T>(value: unknown): value is AttributeOption<T> {
	return isPlainObject(value) && 'value' in value;
}
