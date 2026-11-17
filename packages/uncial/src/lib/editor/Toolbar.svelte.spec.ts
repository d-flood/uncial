import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { get } from 'svelte/store';
import { Editor as TiptapEditor, type JSONContent } from '@tiptap/core';
import Editor from './Editor.svelte';
import Toolbar from './Toolbar.svelte';
import { createContentModel, defaultToolbar } from '../model.js';
import { smallCaps } from '../render/smallCapsMarkFixture.js';
import { createAttributesController } from './attributesController.js';
import { resolveRegistry } from '../core/registry.js';
import { createEditorExtensions } from '../shared/tiptap.js';

const EXISTING_LINK_ATTRS = {
	href: 'https://old.example/docs',
	title: 'Old docs'
};

function createHarness(linked: boolean) {
	const host = document.createElement('div');
	document.body.append(host);
	const content = linked
		? [
				{ type: 'text', text: 'Read the ' },
				{ type: 'text', text: 'docs', marks: [{ type: 'link', attrs: EXISTING_LINK_ATTRS }] },
				{ type: 'text', text: ' today' }
			]
		: [{ type: 'text', text: 'Link me' }];
	const editor = new TiptapEditor({
		element: host,
		extensions: createEditorExtensions(),
		content: { type: 'doc', content: [{ type: 'paragraph', content }] }
	});
	const controller = createAttributesController();
	controller.attach(editor, resolveRegistry([]));

	render(Toolbar, {
		editor,
		onEditLink: () => controller.openLinkAttributes()
	});

	// Select the words, or put the caret inside the linked word "docs".
	editor.commands.setTextSelection(linked ? { from: 11, to: 13 } : { from: 1, to: 8 });

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
		const { editor, controller, cleanup } = createHarness(false);

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
		const { editor, controller, cleanup } = createHarness(false);

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
		const { editor, controller, cleanup } = createHarness(true);

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
		const { editor, controller, cleanup } = createHarness(true);

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

describe('Toolbar from the Content model', () => {
	it('toggles a defined Mark, and inserts and edits a table', async () => {
		const tableIds = ['table', 'addRowAfter', 'deleteRow', 'addColumnAfter', 'deleteColumn'];
		const model = createContentModel({
			blocks: [],
			marks: [smallCaps],
			editor: { toolbar: [...defaultToolbar, 'smallCaps', ...tableIds] }
		});
		let json: JSONContent = {};
		render(Editor, {
			model,
			json: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mark me' }] }]
			},
			onChange: (next: JSONContent) => (json = next)
		});
		const button = (name: string) => page.getByRole('button', { name, exact: true });
		const cells = () => json.content?.[1]?.content?.map((row) => row.content?.length);

		await page.getByText('Mark me').tripleClick();
		await button('Small caps').click();
		await expect
			.poll(() => json.content?.[0]?.content?.[0]?.marks)
			.toEqual([{ type: 'smallCaps' }]);

		await userEvent.keyboard('{End}');
		await expect.element(button('Add row')).toBeDisabled();
		await button('Table').click();
		await expect.poll(cells).toEqual([2, 2, 2]);
		await button('Add row').click();
		await button('Add column').click();
		await expect.poll(cells).toEqual([3, 3, 3, 3]);
		await button('Delete row').click();
		await button('Delete column').click();
		await expect.poll(cells).toEqual([2, 2, 2]);
	});
});
