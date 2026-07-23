import type { AttributeSpec } from '../core/types.js';
import type { DocumentMetaController } from './metaController.js';
interface Props {
    controller: DocumentMetaController;
    fields?: ReadonlyMap<string, AttributeSpec<unknown>>;
    onCommit?: (meta: Record<string, unknown>) => void;
}
declare const DocumentMetaPanel: import("svelte").Component<Props, {}, "">;
type DocumentMetaPanel = ReturnType<typeof DocumentMetaPanel>;
export default DocumentMetaPanel;
