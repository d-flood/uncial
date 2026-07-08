import { mount, unmount } from 'svelte';
import 'uncial/styles';
import AdminEditor from './AdminEditor.svelte';
import { createBlockRegistry, createSchema as createUncialSchema } from 'uncial/core';
import type { ContentSchema } from 'uncial/core';
import type { ToolbarFeature } from 'uncial/editor';
import { setActiveApiUrls } from './apiUrls.js';
import { createBlocks, normalizeConfig, resolveToolbarExtensions } from './config.js';
import type { UncialWidgetConfig } from './config.js';
import { ensureUncialWagtailGlobal } from './uncialGlobal.js';

const emptyDocument = { type: 'doc', content: [] };

class UncialEditorElement extends HTMLElement {
	json?: Record<string, unknown>;
	schema?: ContentSchema;
	toolbarFeatures?: string[];
	toolbarExtensions?: ToolbarFeature[];
	blocks?: ReturnType<typeof createBlockRegistry>;
	#mounted: Record<string, unknown> | null = null;

	connectedCallback() {
		this.#mounted = mount(AdminEditor, {
			target: this,
			props: {
				blocks: this.blocks,
				json: this.json,
				schema: this.schema,
				toolbarFeatures: this.toolbarFeatures,
				toolbarExtensions: this.toolbarExtensions,
				onChange: (document: unknown) => {
					this.json = document as Record<string, unknown>;
					this.dispatchEvent(
						new CustomEvent('uncial-change', { detail: document, bubbles: true, composed: true })
					);
				}
			}
		});
	}

	disconnectedCallback() {
		if (!this.#mounted) return;
		void unmount(this.#mounted);
		this.#mounted = null;
	}
}

if (!customElements.get('uncial-editor')) {
	customElements.define('uncial-editor', UncialEditorElement);
}

function parseJson(value: string | undefined | null, fallback: unknown) {
	try {
		return value ? JSON.parse(value) : fallback;
	} catch (_error) {
		return fallback;
	}
}

function createSchema(config: UncialWidgetConfig, blocks: ReturnType<typeof createBlockRegistry>) {
	return createUncialSchema(blocks, {
		allowedBlocks: config.allowedBlocks,
		allowedMarks: config.allowedMarks
	});
}

function applyGlobalConfig(config: UncialWidgetConfig) {
	setActiveApiUrls(config.apiUrls);
	if (config.apiUrls.chooserModal) {
		// chooser-bridge.js reads this at call time; merge, never overwrite.
		ensureUncialWagtailGlobal().imageChooserUrl = config.apiUrls.chooserModal;
	}
}

function initWidget(widget: Element) {
	if (!(widget instanceof HTMLElement) || widget.dataset.uncialMounted === 'true') return;

	const input =
		widget.querySelector<HTMLTextAreaElement | HTMLInputElement>('[data-uncial-input]') ??
		widget.querySelector<HTMLInputElement>('input[type="hidden"]');
	const mount = widget.querySelector<HTMLElement>('[data-uncial-editor]');
	if (!input || !mount) return;

	const config = normalizeConfig(parseJson(widget.dataset.uncialConfig, {}));
	applyGlobalConfig(config);

	const editor = document.createElement('uncial-editor') as UncialEditorElement;

	editor.json = parseJson(input.value, emptyDocument) as Record<string, unknown>;
	editor.blocks = createBlocks(config);
	editor.schema = createSchema(config, editor.blocks);
	editor.toolbarFeatures = config.toolbarFeatures;
	editor.toolbarExtensions = resolveToolbarExtensions(config.toolbarExtensions);
	editor.addEventListener('uncial-change', (event) => {
		input.value = JSON.stringify((event as CustomEvent).detail ?? emptyDocument);
	});

	mount.replaceChildren(editor);
	widget.dataset.uncialMounted = 'true';
}

function initAll(root: ParentNode = document) {
	root.querySelectorAll('.uncial-wagtail-widget').forEach(initWidget);
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', () => initAll(), { once: true });
} else {
	initAll();
}

document.addEventListener('w-formset:added', (event) => initAll(event.target as ParentNode));
