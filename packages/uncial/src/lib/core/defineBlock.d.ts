import type { BlockAttributes, BlockDefinition, RuntimeBlockConfig } from './types.js';
import type { BlockRuntimePlugin } from './runtime.js';
export declare function defineRuntimeBlock<Attrs extends BlockAttributes, Component>(runtime: BlockRuntimePlugin<Component>, config: RuntimeBlockConfig<Attrs, Component>): BlockDefinition<Attrs>;
