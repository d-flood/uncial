import type { PMPath } from '../shared/document.js';
import type { AttributeSpec, ValidateDocumentOptions, ValidationIssue } from './types.js';
export declare function normalizeMeta(meta: unknown, metaFields: ReadonlyMap<string, AttributeSpec<unknown>>): Record<string, unknown>;
export declare function validateMeta(meta: unknown, metaFields: ReadonlyMap<string, AttributeSpec<unknown>>, issues: ValidationIssue[], options?: ValidateDocumentOptions, path?: PMPath): void;
export declare function toMetaDraftValues(metaFields: ReadonlyMap<string, AttributeSpec<unknown>>, meta?: Record<string, unknown>): Record<string, unknown>;
export declare function parseMetaDraftValues(metaFields: ReadonlyMap<string, AttributeSpec<unknown>>, draft: Record<string, unknown>): Record<string, unknown>;
export declare function serializeMeta(metaFields: ReadonlyMap<string, AttributeSpec<unknown>>, meta?: Record<string, unknown>): Record<string, unknown>;
