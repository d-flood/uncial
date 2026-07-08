import UncialEditor from './UncialEditor.svelte';
import UncialRenderer from './UncialRenderer.svelte';
import { mount, unmount } from 'svelte';
import { reactiveProps } from './reactiveProps.svelte.js';

import type { AnyExtension, JSONContent } from '@tiptap/core';
import type {
	BlockAttributesController,
	ToolbarFeature,
	ToolbarFeatureSelection
} from '../editor/index.js';
import type {
	AttributeSpec,
	BlockDefinition,
	BlockRegistry,
	ContentSchema,
	DocumentMetaSchema,
	ValidationIssue
} from '../core/types.js';

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

const BrowserHTMLElement = globalThis.HTMLElement ?? class {};

const STYLESHEET_ATTRIBUTE = 'stylesheet';

abstract class UncialElement<Props extends Record<string, unknown>> extends BrowserHTMLElement {
	static readonly observedAttributes = [STYLESHEET_ATTRIBUTE];

	/**
	 * `$state`-backed props shared with the mounted Svelte component. Mutating
	 * this object updates the component in place; the component is mounted once
	 * per connection instead of being destroyed and recreated per property set.
	 */
	protected readonly props: Props = reactiveProps({} as Props);
	private instance: Record<string, unknown> | null = null;
	private readonly root = this.attachShadow({ mode: 'open' });
	private stylesheetLinks: HTMLLinkElement[] = [];

	connectedCallback(): void {
		if (this.instance) return;
		this.instance = this.mountComponent(this.root);
	}

	disconnectedCallback(): void {
		if (!this.instance) return;
		void unmount(this.instance);
		this.instance = null;
	}

	attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
		if (name !== STYLESHEET_ATTRIBUTE || oldValue === newValue) return;
		this.renderStylesheetLinks(newValue);
	}

	/**
	 * One or more whitespace-separated stylesheet URLs rendered as
	 * `<link rel="stylesheet">` elements inside the shadow root.
	 */
	get stylesheet(): string | null {
		return this.getAttribute(STYLESHEET_ATTRIBUTE);
	}

	set stylesheet(value: string | null | undefined) {
		if (value == null || value === '') {
			this.removeAttribute(STYLESHEET_ATTRIBUTE);
			return;
		}

		this.setAttribute(STYLESHEET_ATTRIBUTE, value);
	}

	protected setProp<Key extends keyof Props>(key: Key, value: Props[Key]): void {
		this.props[key] = value;
	}

	protected emit(type: string, detail: unknown): void {
		this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
	}

	protected abstract mountComponent(target: ShadowRoot): Record<string, unknown>;

	private renderStylesheetLinks(value: string | null): void {
		for (const link of this.stylesheetLinks) {
			link.remove();
		}

		const hrefs = (value ?? '').split(/\s+/).filter(Boolean);
		this.stylesheetLinks = hrefs.map((href) => {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = href;
			return link;
		});

		this.root.prepend(...this.stylesheetLinks);
	}
}

class UncialEditorElement extends UncialElement<EditorHostProps> {
	constructor() {
		super();
		this.props.onIssue = (issue: ValidationIssue) => this.emit('uncial-issue', issue);
		this.props.onChange = (document: JSONContent) => {
			// Keep the `json` getter in sync with internal edits. Assigning the
			// same document back is safe: bindEditor's serialized-content guard
			// prevents the update from re-entering the editor as a `setContent`.
			this.props.json = document;
			this.emit('uncial-change', document);
		};
		this.props.onMetaChange = (meta: Record<string, unknown>) => {
			// Mirror `onChange`: keep the `meta` getter current and notify listeners.
			this.props.meta = meta;
			this.emit('uncial-meta-change', meta);
		};
	}

	get blocks(): EditorProps['blocks'] {
		return this.props.blocks;
	}
	set blocks(value: EditorProps['blocks']) {
		this.setProp('blocks', value);
	}

	get schema(): EditorProps['schema'] {
		return this.props.schema;
	}
	set schema(value: EditorProps['schema']) {
		this.setProp('schema', value);
	}

	get json(): EditorProps['json'] {
		return this.props.json;
	}
	set json(value: EditorProps['json']) {
		this.setProp('json', value);
	}

	get meta(): EditorProps['meta'] {
		return this.props.meta;
	}
	set meta(value: EditorProps['meta']) {
		this.setProp('meta', value);
	}

	get metaFields(): EditorProps['metaFields'] {
		return this.props.metaFields;
	}
	set metaFields(value: EditorProps['metaFields']) {
		this.setProp('metaFields', value);
	}

	get extensions(): EditorProps['extensions'] {
		return this.props.extensions;
	}
	set extensions(value: EditorProps['extensions']) {
		this.setProp('extensions', value);
	}

	get toolbarFeatures(): EditorProps['toolbarFeatures'] {
		return this.props.toolbarFeatures;
	}
	set toolbarFeatures(value: EditorProps['toolbarFeatures']) {
		this.setProp('toolbarFeatures', value);
	}

	get toolbarExtensions(): EditorProps['toolbarExtensions'] {
		return this.props.toolbarExtensions;
	}
	set toolbarExtensions(value: EditorProps['toolbarExtensions']) {
		this.setProp('toolbarExtensions', value);
	}

	get attributesController(): EditorProps['attributesController'] {
		return this.props.attributesController;
	}
	set attributesController(value: EditorProps['attributesController']) {
		this.setProp('attributesController', value);
	}

	protected mountComponent(target: ShadowRoot): Record<string, unknown> {
		return mount(UncialEditor, { target, props: this.props });
	}
}

class UncialRendererElement extends UncialElement<RendererHostProps> {
	constructor() {
		super();
		this.props.onIssue = (issue: ValidationIssue) => this.emit('uncial-issue', issue);
	}

	get content(): RendererProps['content'] {
		return this.props.content;
	}
	set content(value: RendererProps['content']) {
		this.setProp('content', value);
	}

	get blocks(): RendererProps['blocks'] {
		return this.props.blocks;
	}
	set blocks(value: RendererProps['blocks']) {
		this.setProp('blocks', value);
	}

	get schema(): RendererProps['schema'] {
		return this.props.schema;
	}
	set schema(value: RendererProps['schema']) {
		this.setProp('schema', value);
	}

	protected mountComponent(target: ShadowRoot): Record<string, unknown> {
		return mount(UncialRenderer, { target, props: this.props });
	}
}

if (typeof customElements !== 'undefined') {
	if (!customElements.get('uncial-editor')) {
		customElements.define('uncial-editor', UncialEditorElement);
	}

	if (!customElements.get('uncial-renderer')) {
		customElements.define('uncial-renderer', UncialRendererElement);
	}
}

export { UncialEditor, UncialEditorElement, UncialRenderer, UncialRendererElement };
