import { type AnyExtension } from '@tiptap/core';
import type { BlockDefinition, BlockRegistry, ContentSchema } from '../core/types.js';
import type { RichTextFeature } from '../core/types.js';
export type BlockActivationCallback = (pos: number) => void;
export declare function getBlockDefaultAttrs(block: BlockDefinition): Record<string, unknown>;
export declare function createRichTextExtensions(features: ReadonlySet<RichTextFeature>): AnyExtension[];
export declare function createEditorExtensions(blocks?: BlockRegistry | BlockDefinition[], schema?: ContentSchema, onActivateBlock?: BlockActivationCallback, extensions?: AnyExtension[]): AnyExtension[];
