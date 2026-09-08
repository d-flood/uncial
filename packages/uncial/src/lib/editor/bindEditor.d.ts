import { Editor as TiptapEditor, type AnyExtension, type JSONContent } from '@tiptap/core';
import type { ActionReturn } from 'svelte/action';
import type { BlockDefinition, BlockRegistry, ContentSchema, ValidationIssue } from '../core/types.js';
import { type BlockAttributesController } from './attributesController.js';
export interface BindEditorOptions {
    blocks?: BlockRegistry | BlockDefinition[];
    schema?: ContentSchema;
    json?: JSONContent;
    meta?: Record<string, unknown>;
    extensions?: AnyExtension[];
    attributesController?: BlockAttributesController | null;
    onIssue?: (issue: ValidationIssue) => void;
    onChange?: (json: JSONContent) => void;
    onMetaChange?: (meta: Record<string, unknown>) => void;
    onEditor?: (editor: TiptapEditor | null) => void;
}
export declare function bindEditor(node: HTMLElement, initialOptions?: BindEditorOptions): ActionReturn<BindEditorOptions>;
