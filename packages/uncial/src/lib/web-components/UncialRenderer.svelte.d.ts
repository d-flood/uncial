import type { JSONContent } from '@tiptap/core';
import type { BlockDefinition, BlockRegistry, ContentSchema, ValidationIssue } from '../core/types.js';
interface Props {
    content?: JSONContent;
    blocks?: BlockRegistry | BlockDefinition[];
    schema?: ContentSchema;
    onIssue?: (issue: ValidationIssue) => void;
}
declare const UncialRenderer: import("svelte").Component<Props, {}, "">;
type UncialRenderer = ReturnType<typeof UncialRenderer>;
export default UncialRenderer;
