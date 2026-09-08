import type { Editor } from '@tiptap/core';
import type { ContentSchema } from '../core/types.js';
export type ToolbarFeatureId = 'bold' | 'italic' | 'strike' | 'code' | 'link' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6' | 'bulletList' | 'orderedList' | 'blockquote' | 'codeBlock' | 'horizontalRule';
export type ToolbarFeatureSelection = '*' | '__all__' | readonly string[];
export interface ToolbarFeatureContext {
    editor: Editor;
    schema?: ContentSchema;
}
export interface ToolbarFeature {
    id: string;
    label: string;
    tooltip?: string;
    group?: 'mark' | 'heading' | 'block' | 'insert' | string;
    isAllowed?: (context: ToolbarFeatureContext) => boolean;
    isActive?: (context: ToolbarFeatureContext) => boolean;
    canRun?: (context: ToolbarFeatureContext) => boolean;
    run: (context: ToolbarFeatureContext) => void;
}
export declare const defaultToolbarFeatures: readonly ToolbarFeatureId[];
export declare const builtinToolbarFeatures: readonly ToolbarFeature[];
/**
 * A single generic heading toggle (level 3) whose active state matches any
 * heading level. Used by editors that expose one heading control instead of
 * the per-level `heading2`..`heading6` buttons.
 */
export declare const genericHeadingToolbarFeature: ToolbarFeature;
/**
 * Toolbar descriptors for the rich text attribute editor. Ids line up with
 * `RichTextFeature` names so the list can be filtered by a resolved rich text
 * feature set; labels match that editor's existing button labels.
 */
export declare const richTextAttributeToolbarFeatures: readonly ToolbarFeature[];
export declare function resolveToolbarFeatures({ editor, schema, toolbarFeatures, toolbarExtensions }: {
    editor: Editor | null | undefined;
    schema?: ContentSchema;
    toolbarFeatures?: ToolbarFeatureSelection;
    toolbarExtensions?: readonly ToolbarFeature[];
}): ToolbarFeature[];
