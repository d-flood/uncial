import type { Component } from 'svelte';
import type { PMDoc } from '../shared/document.js';
import type { RichTextFeatureSelection } from '../core/types.js';
interface Props {
    value?: unknown;
    features?: RichTextFeatureSelection;
    placeholder?: string;
    onChange: (value: PMDoc) => void;
}
declare const RichTextAttributeEditor: Component<Props, {}, "">;
type RichTextAttributeEditor = ReturnType<typeof RichTextAttributeEditor>;
export default RichTextAttributeEditor;
