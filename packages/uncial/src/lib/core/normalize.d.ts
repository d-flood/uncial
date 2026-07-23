import type { PMDoc } from '../shared/document.js';
import type { ContentSchema } from './types.js';
import { resolveRegistry } from './registry.js';
export { CURRENT_DOCUMENT_VERSION } from './migrations.js';
/**
 * Sanitizes the structural shape of a raw document (object nodes with string
 * types, valid text nodes, array content/marks, object attrs — no schema or
 * block-attribute normalization) and runs the registered migrations on the
 * result, so migration callbacks never receive hostile shapes. A throwing
 * migration never propagates: on throw the sanitized-but-unmigrated document
 * is returned so normalization can proceed.
 *
 * Exported for tests; hosts run migrations via `normalizeDocument`.
 */
export declare function migrateDocument(source: Partial<PMDoc>, fromVersion: number, toVersion?: number): PMDoc;
export declare function normalizeDocument(document: Partial<PMDoc> | null | undefined, blocks: Parameters<typeof resolveRegistry>[0], schema?: ContentSchema): PMDoc;
