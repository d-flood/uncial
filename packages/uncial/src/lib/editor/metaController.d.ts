import { type Readable } from 'svelte/store';
import type { AttributeSpec, ValidationResult } from '../core/types.js';
export interface DocumentMetaState {
    draft: Record<string, unknown>;
    errors: Record<string, string>;
    dirty: boolean;
}
export interface DocumentMetaCommitResult {
    meta: Record<string, unknown>;
    validation: ValidationResult;
}
export interface DocumentMetaController extends Readable<DocumentMetaState> {
    getMeta(): Record<string, unknown>;
    setDraft(name: string, value: unknown): void;
    reset(meta?: Record<string, unknown>): void;
    commit(): DocumentMetaCommitResult;
    setMetaFields(fields: ReadonlyMap<string, AttributeSpec<unknown>>): void;
}
export declare function createDocumentMetaController(fields?: ReadonlyMap<string, AttributeSpec<unknown>>, meta?: Record<string, unknown>): DocumentMetaController;
