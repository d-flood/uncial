import type { AnyExtension, JSONContent } from '@tiptap/core';
import type { BlockAttributesController, ToolbarFeature, ToolbarFeatureSelection } from '../editor/index.js';
import type { AttributeSpec, BlockDefinition, BlockRegistry, ContentSchema, DocumentMetaSchema, ValidationIssue } from '../core/types.js';
interface Props {
    blocks?: BlockRegistry | BlockDefinition[];
    schema?: ContentSchema;
    json?: JSONContent;
    meta?: Record<string, unknown>;
    metaFields?: DocumentMetaSchema | ReadonlyMap<string, AttributeSpec<unknown>>;
    extensions?: AnyExtension[];
    toolbarFeatures?: ToolbarFeatureSelection;
    toolbarExtensions?: ToolbarFeature[];
    attributesController?: BlockAttributesController | null;
    onIssue?: (issue: ValidationIssue) => void;
    onChange?: (document: JSONContent) => void;
    onMetaChange?: (meta: Record<string, unknown>) => void;
}
declare const UncialEditor: import("svelte").Component<Props, {}, "json" | "meta">;
type UncialEditor = ReturnType<typeof UncialEditor>;
export default UncialEditor;
