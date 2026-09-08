import type { Component } from 'svelte';
import type { BlockRegistry, ContentSchema } from '../core/types.js';
import type { PMNode } from '../shared/document.js';
interface Props {
    node: PMNode;
    registry: BlockRegistry;
    schema?: ContentSchema;
}
declare const RichNode: Component<Props, {}, "">;
type RichNode = ReturnType<typeof RichNode>;
export default RichNode;
