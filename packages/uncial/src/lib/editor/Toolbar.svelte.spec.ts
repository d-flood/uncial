import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { get } from 'svelte/store';
import { Editor as TiptapEditor } from '@tiptap/core';
import Toolbar from './Toolbar.svelte';
import { createBlockAttributesController } from './attributesController.js';
import { resolveRegistry } from '../core/registry.js';
import { createEditorExtensions } from '../shared/tiptap.js';

function createLinkEditingHarness() {
	const host = document.createElement('div');
	document.body.append(host);
	const editor = new TiptapEditor({
		element: host,
		extensions: createEditorExtensions(),
		content: {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Link me' }] }]
		}
	});
	const controller = createBlockAttributesController();
	controller.attach(editor, resolveRegistry([]));

	render(Toolbar, {
		editor,
		onEditLink: () => controller.openLinkAttributes()
	});

	// Select the words so a link could be applied.
	editor.commands.setTextSelection({ from: 1, to: 8 });

	return {
		editor,
		controller,
		cleanup: () => {
			controller.detach();
			editor.destroy();
			host.remove();
		}
	};
}

const EXISTING_LINK_ATTRS = {
	href: 'https://old.example/docs',
	title: 'Old docs'
};

function createExistingLinkHarness() {
	const host = document.createElement('div');
	document.body.append(host);
	const editor = new TiptapEditor({
		element: host,
		extensions: createEditorExtensions(),
		content: {
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{ type: 'text', text: 'Read the ' },
						{
							type: 'text',
							text: 'docs',
							marks: [{ type: 'link', attrs: EXISTING_LINK_ATTRS }]
						},
						{ type: 'text', text: ' today' }
					]
				}
			]
		}
	});
	const controller = createBlockAttributesController();
	controller.attach(editor, resolveRegistry([]));

	render(Toolbar, {
		editor,
		onEditLink: () => controller.openLinkAttributes()
	});

	// Place the caret inside the linked word "docs" (positions 10-14).
	editor.commands.setTextSelection({ from: 11, to: 13 });

	return {
		editor,
		controller,
		cleanup: () => {
			controller.detach();
			editor.destroy();
			host.remove();
		}
	};
}

function documentHasLink(editor: TiptapEditor): boolean {
	return JSON.stringify(editor.getJSON()).includes('"link"');
}

function getLinkedText(editor: TiptapEditor): { text?: string; attrs?: Record<string, unknown> } {
	const paragraph = editor.getJSON().content?.[0];
	const linked = paragraph?.content?.find((node) =>
		node.marks?.some((mark) => mark.type === 'link')
	);
	const mark = linked?.marks?.find((entry) => entry.type === 'link');
	return { text: (linked as { text?: string } | undefined)?.text, attrs: mark?.attrs };
}

describe('Toolbar link editing', () => {
	it('opens the link panel without applying a placeholder link, so cancel leaves no link', async () => {
		const { editor, controller, cleanup } = createLinkEditingHarness();

		await page.getByRole('button', { name: 'Link' }).click();

		// The panel is open but the document is untouched.
		expect(get(controller).link.open).toBe(true);
		expect(editor.isActive('link')).toBe(false);
		expect(documentHasLink(editor)).toBe(false);

		// Cancelling the panel leaves no dangling link mark behind.
		controller.closeLinkAttributes();
		expect(get(controller).link.open).toBe(false);
		expect(documentHasLink(editor)).toBe(false);

		cleanup();
	});

	it('applies the drafted link, including title and class, only on panel commit', async () => {
		const { editor, controller, cleanup } = createLinkEditingHarness();

		await page.getByRole('button', { name: 'Link' }).click();

		controller.setLinkAttr('href', 'https://example.com/docs');
		controller.setLinkAttr('title', 'Example docs');
		controller.setLinkAttr('class', 'fancy-link');

		// Drafting attributes does not touch the document.
		expect(documentHasLink(editor)).toBe(false);

		expect(controller.commitLinkAttributes()).toBe(true);

		expect(editor.isActive('link')).toBe(true);
		expect(editor.getAttributes('link')).toMatchObject({
			href: 'https://example.com/docs',
			title: 'Example docs',
			class: 'fancy-link'
		});

		cleanup();
	});

	it('prefills the panel from an existing link and leaves it unchanged on cancel', async () => {
		const { editor, controller, cleanup } = createExistingLinkHarness();

		const before = getLinkedText(editor);
		expect(before.text).toBe('docs');
		expect(before.attrs).toMatchObject(EXISTING_LINK_ATTRS);

		await page.getByRole('button', { name: 'Link' }).click();

		// The panel opens prefilled with the current link attributes.
		expect(get(controller).link.open).toBe(true);
		expect(get(controller).link.attrs).toMatchObject(EXISTING_LINK_ATTRS);

		// Opening the panel alone must not touch the document.
		expect(getLinkedText(editor)).toEqual(before);

		// Cancelling keeps the original link: not unset, not replaced with '#'.
		controller.closeLinkAttributes();
		expect(get(controller).link.open).toBe(false);
		expect(editor.isActive('link')).toBe(true);
		const { text, attrs } = getLinkedText(editor);
		expect(text).toBe('docs');
		expect(attrs).toMatchObject(EXISTING_LINK_ATTRS);
		expect(attrs?.href).not.toBe('#');

		cleanup();
	});

	it('updates the existing link mark when the panel commits a new href and title', async () => {
		const { editor, controller, cleanup } = createExistingLinkHarness();

		await page.getByRole('button', { name: 'Link' }).click();
		expect(get(controller).link.attrs).toMatchObject(EXISTING_LINK_ATTRS);

		controller.setLinkAttr('href', 'https://new.example/guide');
		controller.setLinkAttr('title', 'New guide');

		// Drafting attributes does not touch the document yet.
		expect(getLinkedText(editor).attrs).toMatchObject(EXISTING_LINK_ATTRS);

		expect(controller.commitLinkAttributes()).toBe(true);

		// The whole existing link range is updated, not just the caret slice.
		expect(editor.isActive('link')).toBe(true);
		const { text, attrs } = getLinkedText(editor);
		expect(text).toBe('docs');
		expect(attrs).toMatchObject({
			href: 'https://new.example/guide',
			title: 'New guide'
		});
		expect(editor.getText()).toBe('Read the docs today');

		cleanup();
	});
});
