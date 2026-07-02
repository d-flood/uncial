import { mount, unmount } from 'svelte';
import '../../../uncial/src/lib/styles/index.css';
import AdminEditor from './AdminEditor.svelte';
import { createBlockRegistry, createSchema as createUncialSchema } from 'uncial/core';
import type { ContentSchema } from 'uncial/core';
import { createCalloutBlock, createCardBlock } from './demoBlocks.js';
import { createWagtailImageBlock } from './imageBlock.js';
import { openImageBrowser } from './imageBrowser.js';
import type { ChooseAttributeEvent } from './imageBrowser.js';

type WidgetConfig = {
	allowedBlocks?: string[];
	allowedMarks?: string[];
	toolbarFeatures?: string[];
	imageRenditions?: string[];
};

const emptyDocument = { type: 'doc', content: [] };

class UncialEditorElement extends HTMLElement {
	json?: Record<string, unknown>;
	schema?: ContentSchema;
	toolbarFeatures?: string[];
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

function stringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeConfig(config: WidgetConfig): WidgetConfig {
	return {
		allowedBlocks: stringArray(config.allowedBlocks),
		allowedMarks: stringArray(config.allowedMarks),
		toolbarFeatures: stringArray(config.toolbarFeatures),
		imageRenditions: stringArray(config.imageRenditions)
	};
}

function createSchema(config: WidgetConfig, blocks: ReturnType<typeof createBlockRegistry>) {
	return createUncialSchema(blocks, {
		allowedBlocks: config.allowedBlocks,
		allowedMarks: config.allowedMarks
	});
}

function createBlocks(config: WidgetConfig) {
	const blocks = [];
	if (config.allowedBlocks?.includes('wagtail.image')) {
		blocks.push(
			createWagtailImageBlock(
				config.imageRenditions?.length ? { renditions: config.imageRenditions } : {}
			)
		);
	}
	if (config.allowedBlocks?.includes('callout')) {
		blocks.push(createCalloutBlock());
	}
	if (config.allowedBlocks?.includes('card')) {
		blocks.push(createCardBlock());
	}
	return createBlockRegistry(blocks);
}

function initWidget(widget: Element) {
	if (!(widget instanceof HTMLElement) || widget.dataset.uncialMounted === 'true') return;

	const input = widget.querySelector<HTMLInputElement>('input[type="hidden"]');
	const mount = widget.querySelector<HTMLElement>('[data-uncial-editor]');
	if (!input || !mount) return;

	const config = normalizeConfig(parseJson(widget.dataset.uncialConfig, {}) as WidgetConfig);
	const editor = document.createElement('uncial-editor') as HTMLElement & {
		json?: unknown;
		schema?: unknown;
		toolbarFeatures?: string[];
		blocks?: ReturnType<typeof createBlockRegistry>;
	};

	editor.json = parseJson(input.value, emptyDocument);
	editor.blocks = createBlocks(config);
	editor.schema = createSchema(config, editor.blocks);
	editor.toolbarFeatures = config.toolbarFeatures;
	editor.addEventListener('uncial-change', (event) => {
		input.value = JSON.stringify((event as CustomEvent).detail ?? emptyDocument);
	});

	mount.replaceChildren(editor);
	widget.dataset.uncialMounted = 'true';
}

function initAll(root: ParentNode = document) {
	root.querySelectorAll('.uncial-wagtail-widget').forEach(initWidget);
}

window.addEventListener('uncial:choose-attribute', (event) => {
	const customEvent = event as ChooseAttributeEvent;
	if (customEvent.detail.inputKind !== 'wagtail-image') return;
	void openImageBrowser(customEvent);
});

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', () => initAll(), { once: true });
} else {
	initAll();
}

document.addEventListener('w-formset:added', (event) => initAll(event.target as ParentNode));
