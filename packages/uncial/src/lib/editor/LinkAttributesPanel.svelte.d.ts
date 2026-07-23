interface LinkAttributes {
    href?: string | null;
    target?: string | null;
    rel?: string | null;
    title?: string | null;
    class?: string | null;
}
interface Props {
    attrs?: LinkAttributes;
    onChange: (name: keyof LinkAttributes, value: string | null) => void;
    onApply: () => void;
    onRemove: () => void;
    onClose: () => void;
}
declare const LinkAttributesPanel: import("svelte").Component<Props, {}, "">;
type LinkAttributesPanel = ReturnType<typeof LinkAttributesPanel>;
export default LinkAttributesPanel;
