import type { BlockDefinition, BlockRegistry } from '../core/types.js';
import { type BlockAttributesController } from './attributesController.js';
import { type ChooseAttributeRequest } from './chooseAttribute.js';
interface Props {
    controller: BlockAttributesController;
    blocks?: BlockRegistry | BlockDefinition[];
    /**
     * Resolve a custom attribute value through host-provided UI. Preferred
     * over the deprecated `window`-level `uncial:choose-attribute` event,
     * which cross-talks between multiple editors on one page. When omitted,
     * the panel falls back to dispatching that window event for back-compat.
     */
    onChooseAttribute?: (request: ChooseAttributeRequest) => void;
}
declare const BlockAttributesPanel: import("svelte").Component<Props, {}, "">;
type BlockAttributesPanel = ReturnType<typeof BlockAttributesPanel>;
export default BlockAttributesPanel;
