import type { Editor } from '@tiptap/core';
import type { BlockDefinition, BlockRegistry, ContentSchema } from '../core/types.js';
interface Props {
    editor?: Editor | null;
    blocks?: BlockRegistry | BlockDefinition[];
    schema?: ContentSchema;
}
declare const BlockMenu: import("svelte").Component<Props, {}, "">;
type BlockMenu = ReturnType<typeof BlockMenu>;
export default BlockMenu;
