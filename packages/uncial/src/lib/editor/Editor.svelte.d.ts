import type { AnyExtension, JSONContent } from '@tiptap/core';
import type { AttributeSpec, BlockDefinition, BlockRegistry, ContentSchema, DocumentMetaSchema, ValidationIssue } from '../core/types.js';
import { type BlockAttributesController } from './attributesController.js';
import { type DocumentMetaController } from './metaController.js';
import type { ToolbarFeature, ToolbarFeatureSelection } from './toolbarFeatures.js';
interface Props {
    blocks?: BlockRegistry | BlockDefinition[];
    schema?: ContentSchema;
    json?: JSONContent;
    extensions?: AnyExtension[];
    meta?: Record<string, unknown>;
    metaFields?: DocumentMetaSchema | ReadonlyMap<string, AttributeSpec<unknown>>;
    toolbarFeatures?: ToolbarFeatureSelection;
    toolbarExtensions?: ToolbarFeature[];
    attributesController?: BlockAttributesController | null;
    metaController?: DocumentMetaController | null;
    onIssue?: (issue: ValidationIssue) => void;
}
declare const Editor: import("svelte").Component<Props, {}, "json" | "meta">;
type Editor = ReturnType<typeof Editor>;
export default Editor;
