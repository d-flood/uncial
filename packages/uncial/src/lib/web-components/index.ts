import UncialEditor from './UncialEditor.svelte';
import UncialRenderer from './UncialRenderer.svelte';
import { mount } from 'svelte';
import { UncialElement } from './element.js';

import type { JSONContent } from '@tiptap/core';
import type { BlockAttributesController, FileSource, ImageSource } from '../editor/index.js';
import type { ValidationIssue } from '../core/types.js';
import type { ContentModel } from '../model.js';

type EditorProps = {
	model?: ContentModel;
	json?: JSONContent;
	meta?: Record<string, unknown>;
	attributesController?: BlockAttributesController | null;
	attributesPanel?: boolean | 'docked' | 'overlay' | 'off';
	presentation?: 'card' | 'bare';
	imageSource?: ImageSource;
	fileSource?: FileSource;
};

type EditorHostProps = EditorProps & {
	onIssue?: (issue: ValidationIssue) => void;
	onChange?: (document: JSONContent) => void;
	onMetaChange?: (meta: Record<string, unknown>) => void;
};

type RendererProps = {
	content?: JSONContent;
	model?: ContentModel;
};

type RendererHostProps = RendererProps & {
	onIssue?: (issue: ValidationIssue) => void;
};

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

	get model(): EditorProps['model'] {
		return this.props.model;
	}
	set model(value: EditorProps['model']) {
		this.setProp('model', value);
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

	get attributesController(): EditorProps['attributesController'] {
		return this.props.attributesController;
	}
	set attributesController(value: EditorProps['attributesController']) {
		this.setProp('attributesController', value);
	}

	get attributesPanel(): EditorProps['attributesPanel'] {
		return this.props.attributesPanel;
	}
	set attributesPanel(value: EditorProps['attributesPanel']) {
		this.setProp('attributesPanel', value);
	}

	get presentation(): EditorProps['presentation'] {
		return this.props.presentation;
	}
	set presentation(value: EditorProps['presentation']) {
		this.setProp('presentation', value);
	}

	get imageSource(): EditorProps['imageSource'] {
		return this.props.imageSource;
	}
	set imageSource(value: EditorProps['imageSource']) {
		this.setProp('imageSource', value);
	}

	get fileSource(): EditorProps['fileSource'] {
		return this.props.fileSource;
	}
	set fileSource(value: EditorProps['fileSource']) {
		this.setProp('fileSource', value);
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

	get model(): RendererProps['model'] {
		return this.props.model;
	}
	set model(value: RendererProps['model']) {
		this.setProp('model', value);
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

export { UncialEditorElement, UncialRendererElement };
