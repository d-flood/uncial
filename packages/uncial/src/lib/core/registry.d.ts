import type { BlockDefinition, BlockRegistry, ContentSchema, CreateSchemaOptions } from './types.js';
/**
 * The default mark universe a schema allows when the host does not pass an
 * explicit `allowedMarks`. This is the single source of truth for the default
 * marks — the editor's base extensions (`shared/tiptap.ts`) consume it too, so
 * the fallback schema and the fallback extension set never drift apart.
 */
export declare const DEFAULT_MARKS: readonly ["bold", "italic", "strike", "code", "link"];
export declare function createBlockRegistry(blocks: BlockDefinition[]): BlockRegistry;
export declare function createSchema(registry: BlockRegistry, options?: CreateSchemaOptions): ContentSchema;
export declare function resolveRegistry(blocks: BlockRegistry | BlockDefinition[]): BlockRegistry;
