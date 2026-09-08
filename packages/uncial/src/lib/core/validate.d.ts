import type { PMDoc } from '../shared/document.js';
import type { ContentSchema, ValidateDocumentOptions, ValidationResult } from './types.js';
import { resolveRegistry } from './registry.js';
export declare function validateDocument(document: PMDoc, blocks: Parameters<typeof resolveRegistry>[0], schema: ContentSchema, options?: ValidateDocumentOptions): ValidationResult;
