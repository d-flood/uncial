import type { Editor } from '@tiptap/core';
import type { Component } from 'svelte';
import type { ContentSchema } from '../core/types.js';
import { type ToolbarFeature, type ToolbarFeatureSelection } from './toolbarFeatures.js';
interface Props {
    editor?: Editor | null;
    schema?: ContentSchema;
    toolbarFeatures?: ToolbarFeatureSelection;
    toolbarExtensions?: ToolbarFeature[];
    onEditLink?: () => void;
}
declare const Toolbar: Component<Props, {}, "">;
type Toolbar = ReturnType<typeof Toolbar>;
export default Toolbar;
