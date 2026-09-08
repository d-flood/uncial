import UncialEditor from './UncialEditor.svelte';
import UncialRenderer from './UncialRenderer.svelte';
import type { AnyExtension, JSONContent } from '@tiptap/core';
import type { BlockAttributesController, ToolbarFeature, ToolbarFeatureSelection } from '../editor/index.js';
import type { AttributeSpec, BlockDefinition, BlockRegistry, ContentSchema, DocumentMetaSchema, ValidationIssue } from '../core/types.js';
type EditorProps = {
    blocks?: BlockRegistry | BlockDefinition[];
    schema?: ContentSchema;
    json?: JSONContent;
    meta?: Record<string, unknown>;
    metaFields?: DocumentMetaSchema | ReadonlyMap<string, AttributeSpec<unknown>>;
    extensions?: AnyExtension[];
    toolbarFeatures?: ToolbarFeatureSelection;
    toolbarExtensions?: ToolbarFeature[];
    attributesController?: BlockAttributesController | null;
};
type EditorHostProps = EditorProps & {
    onIssue?: (issue: ValidationIssue) => void;
    onChange?: (document: JSONContent) => void;
    onMetaChange?: (meta: Record<string, unknown>) => void;
};
type RendererProps = {
    content?: JSONContent;
    blocks?: BlockRegistry | BlockDefinition[];
    schema?: ContentSchema;
};
type RendererHostProps = RendererProps & {
    onIssue?: (issue: ValidationIssue) => void;
};
declare const BrowserHTMLElement: {
    new (): HTMLElement;
    prototype: HTMLElement;
};
declare abstract class UncialElement<Props extends Record<string, unknown>> extends BrowserHTMLElement {
    static readonly observedAttributes: string[];
    /**
     * `$state`-backed props shared with the mounted Svelte component. Mutating
     * this object updates the component in place; the component is mounted once
     * per connection instead of being destroyed and recreated per property set.
     */
    protected readonly props: Props;
    private instance;
    private readonly root;
    private stylesheetLinks;
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void;
    /**
     * One or more whitespace-separated stylesheet URLs rendered as
     * `<link rel="stylesheet">` elements inside the shadow root.
     */
    get stylesheet(): string | null;
    set stylesheet(value: string | null | undefined);
    protected setProp<Key extends keyof Props>(key: Key, value: Props[Key]): void;
    protected emit(type: string, detail: unknown): void;
    protected abstract mountComponent(target: ShadowRoot): Record<string, unknown>;
    private renderStylesheetLinks;
}
declare class UncialEditorElement extends UncialElement<EditorHostProps> {
    constructor();
    get blocks(): EditorProps['blocks'];
    set blocks(value: EditorProps['blocks']);
    get schema(): EditorProps['schema'];
    set schema(value: EditorProps['schema']);
    get json(): EditorProps['json'];
    set json(value: EditorProps['json']);
    get meta(): EditorProps['meta'];
    set meta(value: EditorProps['meta']);
    get metaFields(): EditorProps['metaFields'];
    set metaFields(value: EditorProps['metaFields']);
    get extensions(): EditorProps['extensions'];
    set extensions(value: EditorProps['extensions']);
    get toolbarFeatures(): EditorProps['toolbarFeatures'];
    set toolbarFeatures(value: EditorProps['toolbarFeatures']);
    get toolbarExtensions(): EditorProps['toolbarExtensions'];
    set toolbarExtensions(value: EditorProps['toolbarExtensions']);
    get attributesController(): EditorProps['attributesController'];
    set attributesController(value: EditorProps['attributesController']);
    protected mountComponent(target: ShadowRoot): Record<string, unknown>;
}
declare class UncialRendererElement extends UncialElement<RendererHostProps> {
    constructor();
    get content(): RendererProps['content'];
    set content(value: RendererProps['content']);
    get blocks(): RendererProps['blocks'];
    set blocks(value: RendererProps['blocks']);
    get schema(): RendererProps['schema'];
    set schema(value: RendererProps['schema']);
    protected mountComponent(target: ShadowRoot): Record<string, unknown>;
}
export { UncialEditor, UncialEditorElement, UncialRenderer, UncialRendererElement };
