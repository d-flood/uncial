import type { BlockRegistry, ContentSchema } from '../core/types.js';
import type { PMNode } from '../shared/document.js';
interface Props {
    nodes?: PMNode[];
    registry: BlockRegistry;
    schema?: ContentSchema;
}
declare const RichContent: import("svelte").Component<Props, {}, "">;
type RichContent = ReturnType<typeof RichContent>;
export default RichContent;
