import type { JSONContent } from '@tiptap/core';
import type { Snippet } from 'svelte';
import type { BlockDefinition, BlockRegistry, ContentSchema, ValidationIssue } from '../core/types.js';
interface Props {
    content?: JSONContent;
    blocks?: BlockRegistry | BlockDefinition[];
    schema?: ContentSchema;
    meta?: Snippet<[Record<string, unknown> | undefined]>;
    onIssue?: (issue: ValidationIssue) => void;
}
declare const Renderer: import("svelte").Component<Props, {}, "">;
type Renderer = ReturnType<typeof Renderer>;
export default Renderer;
