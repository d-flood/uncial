import { afterEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { createBlockRegistry, createSchema } from 'uncial/core';

import './admin.js';
import { setActiveApiUrls } from './apiUrls.js';

type UncialEditorElement = HTMLElement & {
	json?: Record<string, unknown>;
	schema?: unknown;
	blocks?: ReturnType<typeof createBlockRegistry>;
	toolbarFeatures?: string[];
	toolbarExtensions?: unknown;
};

function paragraphDocument(text: string) {
	return {
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	};
}

function createEditorElement(json: Record<string, unknown>): UncialEditorElement {
	const blocks = createBlockRegistry([]);
	const element = document.createElement('uncial-editor') as UncialEditorElement;
	element.json = json;
	element.blocks = blocks;
	element.schema = createSchema(blocks);
	return element;
}

async function settle() {
	await tick();
	await new Promise((resolve) => setTimeout(resolve, 0));
}

function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#x27;');
}

describe('<uncial-editor> lifecycle', () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	it('mounts the admin editor with the provided document on connect', async () => {
		const element = createEditorElement(paragraphDocument('Hello Wagtail'));
		const container = document.createElement('div');
		document.body.append(container);

		container.append(element);
		await settle();

		expect(element.querySelector('.uncial-wagtail-admin-editor')).not.toBeNull();
		expect(element.textContent).toContain('Hello Wagtail');
	});

	it('unmounts the admin editor on disconnect', async () => {
		const element = createEditorElement(paragraphDocument('Hello Wagtail'));
		document.body.append(element);
		await settle();
		expect(element.querySelector('.uncial-wagtail-admin-editor')).not.toBeNull();

		element.remove();
		await settle();

		expect(element.querySelector('.uncial-wagtail-admin-editor')).toBeNull();
	});

	it('remounts and preserves the edited document when moved to another container', async () => {
		const element = createEditorElement(paragraphDocument('First draft'));
		const containerA = document.createElement('div');
		const containerB = document.createElement('div');
		document.body.append(containerA, containerB);

		containerA.append(element);
		await settle();
		const firstMount = element.querySelector('.uncial-wagtail-admin-editor');
		expect(firstMount).not.toBeNull();

		// Simulate an edit: the element's onChange handler writes the latest
		// Tiptap document back to `element.json`, so by the time Wagtail drags
		// the widget around a formset the property holds the edited state.
		const edited = paragraphDocument('Edited draft');
		element.json = edited;

		// Re-parenting (Wagtail formset drag/reorder) removes then re-inserts
		// the node, firing disconnectedCallback + connectedCallback.
		containerB.append(element);
		await settle();

		expect(element.parentElement).toBe(containerB);
		const secondMount = element.querySelector('.uncial-wagtail-admin-editor');
		expect(secondMount).not.toBeNull();
		expect(secondMount).not.toBe(firstMount);
		expect(element.textContent).toContain('Edited draft');
		expect(element.textContent).not.toContain('First draft');
		// The remounted editor normalizes the document (e.g. adds `version`)
		// and writes it back, so assert the edited content is preserved.
		expect(element.json).toMatchObject(edited);
	});
});

describe('widget initialization from data-uncial-config', () => {
	afterEach(() => {
		document.body.replaceChildren();
		delete window.uncialWagtail;
		setActiveApiUrls(undefined);
	});

	function widgetMarkup(config: Record<string, unknown>, value: unknown = { type: 'doc', content: [] }) {
		const widget = document.createElement('div');
		widget.className = 'uncial-wagtail-widget';
		widget.dataset.uncialConfig = JSON.stringify(config);
		widget.innerHTML = `
			<textarea hidden data-uncial-input name="body">${escapeHtml(JSON.stringify(value))}</textarea>
			<div class="uncial-wagtail-editor" data-uncial-editor></div>
		`;
		return widget;
	}

	function legacyWidgetMarkup(
		config: Record<string, unknown>,
		value: unknown = { type: 'doc', content: [] }
	) {
		const widget = document.createElement('div');
		widget.className = 'uncial-wagtail-widget';
		widget.dataset.uncialConfig = JSON.stringify(config);
		widget.innerHTML = `
			<input type="hidden" name="body" value='${escapeHtml(JSON.stringify(value))}'>
			<div data-uncial-editor></div>
		`;
		return widget;
	}

	async function initViaFormsetAdded(widget: HTMLElement) {
		const container = document.createElement('div');
		container.append(widget);
		document.body.append(container);
		container.dispatchEvent(new CustomEvent('w-formset:added', { bubbles: true }));
		await settle();
	}

	it('merges apiUrls.chooserModal into window.uncialWagtail without overwriting it', async () => {
		const chooseImage = vi.fn(async () => null);
		window.uncialWagtail = { chooseImage };

		await initViaFormsetAdded(
			widgetMarkup({
				allowedBlocks: ['wagtail.image'],
				apiUrls: {
					images: '/cms/api/uncial/images/',
					imagePreview: '/cms/api/uncial/images/0/preview/',
					chooserModal: '/cms/admin/images/chooser/'
				}
			})
		);

		expect(window.uncialWagtail?.imageChooserUrl).toBe('/cms/admin/images/chooser/');
		expect(window.uncialWagtail?.chooseImage).toBe(chooseImage);
		expect(document.querySelector('uncial-editor')).not.toBeNull();
	});

	it('mounts from the textarea template and writes changes back to it', async () => {
		const widget = widgetMarkup({}, paragraphDocument('From textarea'));
		await initViaFormsetAdded(widget);

		const input = widget.querySelector<HTMLTextAreaElement>('[data-uncial-input]');
		const editor = widget.querySelector<UncialEditorElement>('uncial-editor');
		const updated = paragraphDocument('Updated textarea value');

		expect(input).not.toBeNull();
		expect(editor?.json).toMatchObject(paragraphDocument('From textarea'));

		editor?.dispatchEvent(new CustomEvent('uncial-change', { detail: updated }));

		expect(input?.value).toBe(JSON.stringify(updated));
	});

	it('keeps escaped textarea JSON intact without breaking out of the template', async () => {
		const hostile = paragraphDocument('</textarea><script>window.__uncialXss = true</script>');
		const widget = widgetMarkup({}, hostile);
		await initViaFormsetAdded(widget);

		const editor = widget.querySelector<UncialEditorElement>('uncial-editor');

		expect(widget.querySelectorAll('textarea')).toHaveLength(1);
		expect(widget.querySelector('script')).toBeNull();
		expect(editor?.json).toMatchObject(hostile);
	});

	it('still initializes legacy hidden-input widgets', async () => {
		const widget = legacyWidgetMarkup({}, paragraphDocument('Legacy input'));
		await initViaFormsetAdded(widget);

		const editor = widget.querySelector<UncialEditorElement>('uncial-editor');

		expect(editor?.json).toMatchObject(paragraphDocument('Legacy input'));
	});

	it('resolves toolbar extension keys against the global registry', async () => {
		const feature = { id: 'demo-feature', label: 'Demo', run: () => {} };
		window.uncialWagtail = { toolbarExtensions: { 'demo-feature': feature } };

		const widget = widgetMarkup({ toolbarExtensions: ['demo-feature'] });
		await initViaFormsetAdded(widget);

		const editor = document.querySelector<UncialEditorElement>('uncial-editor');
		expect(editor?.toolbarExtensions).toEqual([feature]);
	});
});
