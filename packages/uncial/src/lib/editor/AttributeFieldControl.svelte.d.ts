import type { AttributeSpec } from '../core/types.js';
interface Props {
    name: string;
    spec: AttributeSpec<unknown>;
    value?: unknown;
    error?: string;
    onChange: (value: unknown) => void;
    onCustom?: (name: string, inputKind: string) => void;
}
declare const AttributeFieldControl: import("svelte").Component<Props, {}, "">;
type AttributeFieldControl = ReturnType<typeof AttributeFieldControl>;
export default AttributeFieldControl;
