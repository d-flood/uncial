import { mount, unmount } from 'svelte';
import '../../../uncial/src/app.css';
import AdminEditor from './AdminEditor.svelte';
import { createBlockRegistry } from '../../../uncial/src/lib/core/registry.js';
import type { ContentSchema } from '../../../uncial/src/lib/core/types.js';
import { createWagtailImageBlock } from './imageBlock.js';

type WidgetConfig = {
	allowedBlocks?: string[];
	allowedMarks?: string[];
	toolbarFeatures?: string[];
};

type WagtailImage = {
	id: number;
	title: string;
	previewUrl?: string;
	width?: number;
	height?: number;
};

type ChooseAttributeEvent = CustomEvent<{
	inputKind: string;
	name: string;
	attrs: Record<string, unknown>;
	setAttrs: (attrs: Record<string, unknown>) => void;
}>;

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

function createSchema(config: WidgetConfig) {
	return {
		allowedBlocks: new Set(config.allowedBlocks ?? []),
		allowedMarks: new Set(config.allowedMarks ?? [])
	};
}

function createBlocks(config: WidgetConfig) {
	const blocks = [];
	if (config.allowedBlocks?.includes('wagtail.image')) {
		blocks.push(createWagtailImageBlock());
	}
	return createBlockRegistry(blocks);
}

function initWidget(widget: Element) {
	if (!(widget instanceof HTMLElement) || widget.dataset.uncialMounted === 'true') return;

	const input = widget.querySelector<HTMLInputElement>('input[type="hidden"]');
	const mount = widget.querySelector<HTMLElement>('[data-uncial-editor]');
	if (!input || !mount) return;

	const config = parseJson(widget.dataset.uncialConfig, {}) as WidgetConfig;
	const editor = document.createElement('uncial-editor') as HTMLElement & {
		json?: unknown;
		schema?: unknown;
		toolbarFeatures?: string[];
		blocks?: ReturnType<typeof createBlockRegistry>;
	};

	editor.json = parseJson(input.value, emptyDocument);
	editor.schema = createSchema(config);
	editor.toolbarFeatures = config.toolbarFeatures;
	editor.blocks = createBlocks(config);
	editor.addEventListener('uncial-change', (event) => {
		input.value = JSON.stringify((event as CustomEvent).detail ?? emptyDocument);
	});

	mount.replaceChildren(editor);
	widget.dataset.uncialMounted = 'true';
}

function initAll(root: ParentNode = document) {
	root.querySelectorAll('.uncial-wagtail-widget').forEach(initWidget);
}

async function fetchImages(): Promise<WagtailImage[]> {
	const response = await fetch('/api/uncial/images/');
	if (!response.ok) return [];
	const payload = (await response.json()) as { images?: WagtailImage[] };
	return payload.images ?? [];
}

function closeImageBrowser(dialog: HTMLDialogElement) {
	dialog.close();
	dialog.remove();
}

function createImageButton(image: WagtailImage, onChoose: (image: WagtailImage) => void) {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'uncial-wagtail-image-choice';
	button.innerHTML = `
		${image.previewUrl ? `<img src="${image.previewUrl}" alt="">` : '<span>No preview</span>'}
		<strong>${image.title}</strong>
		<small>#${image.id}${image.width && image.height ? ` · ${image.width}x${image.height}` : ''}</small>
	`;
	button.addEventListener('click', () => onChoose(image));
	return button;
}

async function openImageBrowser(event: ChooseAttributeEvent) {
	const dialog = document.createElement('dialog');
	dialog.className = 'uncial-wagtail-image-browser';
	dialog.innerHTML = `
		<form method="dialog" class="uncial-wagtail-image-browser__header">
			<h2>Choose Wagtail image</h2>
			<button type="button" data-close>Close</button>
		</form>
		<div class="uncial-wagtail-image-browser__grid">Loading images...</div>
	`;
	document.body.append(dialog);
	dialog.querySelector('[data-close]')?.addEventListener('click', () => closeImageBrowser(dialog));
	dialog.showModal();

	const grid = dialog.querySelector('.uncial-wagtail-image-browser__grid');
	const images = await fetchImages();
	if (!grid) return;
	grid.replaceChildren();

	if (images.length === 0) {
		grid.textContent = 'No Wagtail images are available. Upload one in Images first.';
		return;
	}

	for (const image of images) {
		grid.append(
			createImageButton(image, (chosen) => {
				event.detail.setAttrs({
					[event.detail.name]: chosen.id,
					previewUrl: chosen.previewUrl ?? '',
					alt: event.detail.attrs.alt || chosen.title
				});
				closeImageBrowser(dialog);
			})
		);
	}
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
