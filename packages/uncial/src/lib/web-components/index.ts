import UncialEditor from './UncialEditor.svelte';
import UncialRenderer from './UncialRenderer.svelte';
import { mount, unmount } from 'svelte';

import type { AnyExtension, JSONContent } from '@tiptap/core';
import type {
	BlockAttributesController,
	ToolbarFeature,
	ToolbarFeatureSelection
} from '../editor/index.js';
import type { BlockDefinition, BlockRegistry, ContentSchema, ValidationIssue } from '../core/types.js';

type EditorProps = {
	blocks?: BlockRegistry | BlockDefinition[];
	schema?: ContentSchema;
	json?: JSONContent;
	extensions?: AnyExtension[];
	toolbarFeatures?: ToolbarFeatureSelection;
	toolbarExtensions?: ToolbarFeature[];
	attributesController?: BlockAttributesController | null;
};

type RendererProps = {
	content?: JSONContent;
	blocks?: BlockRegistry | BlockDefinition[];
	schema?: ContentSchema;
};

const BrowserHTMLElement = globalThis.HTMLElement ?? class {};

abstract class UncialElement<Props extends Record<string, unknown>> extends BrowserHTMLElement {
	protected props = {} as Props;
	private mounted: Record<string, unknown> | null = null;
	private readonly root = this.attachShadow({ mode: 'open' });

	connectedCallback(): void {
		this.render();
	}

	disconnectedCallback(): void {
		this.destroy();
	}

	protected setProp<Key extends keyof Props>(key: Key, value: Props[Key]): void {
		this.props = { ...this.props, [key]: value };
		if (this.isConnected) this.render();
	}

	protected emit(type: string, detail: unknown): void {
		this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
	}

	protected abstract mount(): Record<string, unknown>;

	private render(): void {
		this.destroy();
		this.mounted = this.mount();
	}

	private destroy(): void {
		if (!this.mounted) return;
		void unmount(this.mounted);
		this.mounted = null;
	}
}

class UncialEditorElement extends UncialElement<EditorProps> {
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

	protected mount(): Record<string, unknown> {
		return mount(UncialEditor, {
			target: this.shadowRoot ?? this,
			props: {
				...this.props,
				onIssue: (issue: ValidationIssue) => this.emit('uncial-issue', issue),
				onChange: (document: JSONContent) => {
					this.props = { ...this.props, json: document };
					this.emit('uncial-change', document);
				}
			}
		});
	}
}

class UncialRendererElement extends UncialElement<RendererProps> {
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

	protected mount(): Record<string, unknown> {
		return mount(UncialRenderer, {
			target: this.shadowRoot ?? this,
			props: {
				...this.props,
				onIssue: (issue: ValidationIssue) => this.emit('uncial-issue', issue)
			}
		});
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
