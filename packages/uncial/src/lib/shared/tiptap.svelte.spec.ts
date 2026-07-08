import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { Editor as TiptapEditor } from '@tiptap/core';
import { createEditorExtensions } from './tiptap.js';
import { defineSvelteBlock } from '../runtime/svelte.js';
import EditorBlockFixture from './EditorBlockFixture.svelte';

const containerBlock = defineSvelteBlock({
	id: 'collapsible',
	label: 'Collapsible',
	attributes: { title: '' },
	component: EditorBlockFixture,
	content: { kind: 'flow' }
});

const atomBlock = defineSvelteBlock({
	id: 'callout',
	label: 'Callout',
	attributes: { title: '' },
	component: EditorBlockFixture
});

function createEditor(content: Record<string, unknown>): {
	editor: TiptapEditor;
	host: HTMLElement;
	cleanup: () => void;
} {
	const host = document.createElement('div');
	document.body.append(host);
	const editor = new TiptapEditor({
		element: host,
		extensions: createEditorExtensions([containerBlock, atomBlock]),
		content
	});

	return {
		editor,
		host,
		cleanup: () => {
			editor.destroy();
			host.remove();
		}
	};
}

describe('container block content expression', () => {
	// The registry used by these tests deliberately contains BOTH a flow
	// container and a leaf custom block: the legacy container expression was
	// built from the registered block names only ("(collapsible | callout)*"),
	// so paragraphs and other StarterKit children were invalid inside
	// containers. `editor.state.doc.check()` and the HTML parse round-trip
	// exercise the content expression directly and fail against that
	// expression.
	it('round-trips a container block with a paragraph child through the editor schema', () => {
		const { editor, cleanup } = createEditor({
			type: 'doc',
			content: [
				{
					type: 'collapsible',
					attrs: { title: 'Details' },
					content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested copy' }] }]
				}
			]
		});

		// The paragraph child must be valid per the schema's content expression,
		// not merely carried along unchecked by nodeFromJSON.
		expect(() => editor.state.doc.check()).not.toThrow();

		const json = editor.getJSON();
		expect(json.content?.[0]?.type).toBe('collapsible');
		expect(json.content?.[0]?.content).toEqual([
			{ type: 'paragraph', content: [{ type: 'text', text: 'Nested copy' }] }
		]);

		// Re-parsing the serialized HTML goes through ProseMirror's DOMParser,
		// which enforces the container content expression and would drop (or
		// lift out) the paragraph if paragraphs were not valid children.
		editor.commands.setContent(editor.getHTML());
		const reparsed = editor.getJSON().content?.[0];
		expect(reparsed?.type).toBe('collapsible');
		expect(reparsed?.content).toEqual([
			{ type: 'paragraph', content: [{ type: 'text', text: 'Nested copy' }] }
		]);

		cleanup();
	});

	it('preserves headings, lists, and code blocks inside flow containers', () => {
		const children = [
			{
				type: 'heading',
				attrs: { level: 2 },
				content: [{ type: 'text', text: 'Section' }]
			},
			{
				type: 'bulletList',
				content: [
					{
						type: 'listItem',
						content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item' }] }]
					}
				]
			},
			{
				type: 'codeBlock',
				content: [{ type: 'text', text: 'const x = 1;' }]
			}
		];
		const { editor, cleanup } = createEditor({
			type: 'doc',
			content: [{ type: 'collapsible', attrs: { title: 'Details' }, content: children }]
		});

		// The children must satisfy the container's content expression.
		expect(() => editor.state.doc.check()).not.toThrow();

		const container = editor.getJSON().content?.[0];
		expect(container?.content?.map((child) => child.type)).toEqual([
			'heading',
			'bulletList',
			'codeBlock'
		]);

		// HTML parse round-trip enforces the content expression as well.
		editor.commands.setContent(editor.getHTML());
		const reparsed = editor.getJSON().content?.[0];
		expect(reparsed?.type).toBe('collapsible');
		expect(reparsed?.content?.map((child) => child.type)).toEqual([
			'heading',
			'bulletList',
			'codeBlock'
		]);

		cleanup();
	});

	it('keeps an empty container ("content": []) valid through the editor round-trip', () => {
		// Persisted documents commonly contain empty containers; a one-or-more
		// content expression ("block+") would make them schema-invalid and any
		// nodeFromJSON(...).check() guard would strip them, losing data.
		const { editor, cleanup } = createEditor({
			type: 'doc',
			content: [
				{ type: 'collapsible', attrs: { title: 'Empty' }, content: [] },
				{ type: 'paragraph', content: [{ type: 'text', text: 'After the container' }] }
			]
		});

		expect(() => editor.state.doc.check()).not.toThrow();

		const json = editor.getJSON();
		expect(json.content?.map((node) => node.type)).toEqual(['collapsible', 'paragraph']);
		expect(json.content?.[0]?.attrs).toMatchObject({ title: 'Empty' });
		expect(json.content?.[0]?.content ?? []).toEqual([]);

		cleanup();
	});

	it('keeps the contentDOM element alive across attribute updates', async () => {
		const { editor, host, cleanup } = createEditor({
			type: 'doc',
			content: [
				{
					type: 'collapsible',
					attrs: { title: 'Before' },
					content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested copy' }] }]
				}
			]
		});

		const contentDOM = host.querySelector('.uncial-nodeview-content');
		expect(contentDOM?.textContent).toContain('Nested copy');

		editor.commands.updateAttributes('collapsible', { title: 'After' });
		await expect
			.poll(() => host.querySelector('[data-testid="fixture-title"]')?.textContent)
			.toBe('After');

		expect(host.querySelector('.uncial-nodeview-content')).toBe(contentDOM);
		expect(contentDOM?.textContent).toContain('Nested copy');

		cleanup();
	});

	it('still accepts custom blocks as container children', () => {
		const { editor, cleanup } = createEditor({
			type: 'doc',
			content: [
				{
					type: 'collapsible',
					attrs: { title: 'Details' },
					content: [{ type: 'callout', attrs: { title: 'Nested block' } }]
				}
			]
		});

		const container = editor.getJSON().content?.[0];
		expect(container?.content?.[0]).toMatchObject({
			type: 'callout',
			attrs: { title: 'Nested block' }
		});

		cleanup();
	});
});

describe('custom block html.parseTag / html.render round-trip', () => {
	// A block that opts into custom HTML serialization: `html.render` emits a
	// bespoke <figure> tag whose attribute names match the block's attribute
	// keys, and `html.parseTag` matches that tag on the way back in. The default
	// `data-uncial-attrs` JSON channel is bypassed, so this exercises the
	// per-attribute parseHTML/renderHTML path (getAttribute(name) + coercion).
	const figureBlock = defineSvelteBlock({
		id: 'figureBlock',
		label: 'Figure',
		attributes: { caption: { default: '' }, level: { default: 1 } },
		component: EditorBlockFixture,
		html: {
			parseTag: 'figure[data-figure-block]',
			render: (attrs) => [
				'figure',
				{ 'data-figure-block': 'true', caption: attrs.caption, level: attrs.level }
			]
		}
	});

	function createFigureEditor(content: Record<string, unknown> | string) {
		const host = document.createElement('div');
		document.body.append(host);
		const editor = new TiptapEditor({
			element: host,
			extensions: createEditorExtensions([figureBlock]),
			content
		});
		return { editor, cleanup: () => (editor.destroy(), host.remove()) };
	}

	it('serializes attributes through html.render (render side)', () => {
		const { editor, cleanup } = createFigureEditor({
			type: 'doc',
			content: [{ type: 'figureBlock', attrs: { caption: 'Cap', level: 2 } }]
		});

		const html = editor.getHTML();
		expect(html).toContain('<figure');
		expect(html).toContain('data-figure-block="true"');
		expect(html).toContain('caption="Cap"');
		// Numeric attrs are serialized to their string form by the DOM serializer.
		expect(html).toContain('level="2"');

		cleanup();
	});

	it('recovers attributes from the custom tag via html.parseTag (parse side)', () => {
		const { editor, cleanup } = createFigureEditor('<p></p>');

		editor.commands.setContent(
			'<figure data-figure-block="true" caption="Parsed" level="4"></figure>'
		);
		const node = editor.getJSON().content?.[0];
		expect(node?.type).toBe('figureBlock');
		// String attribute survives verbatim; the numeric attribute is coerced
		// back from its string form to a number.
		expect(node?.attrs).toMatchObject({ caption: 'Parsed', level: 4 });

		cleanup();
	});

	it('round-trips attributes JSON → HTML → JSON', () => {
		const { editor, cleanup } = createFigureEditor({
			type: 'doc',
			content: [{ type: 'figureBlock', attrs: { caption: 'Round trip', level: 3 } }]
		});

		editor.commands.setContent(editor.getHTML());
		const node = editor.getJSON().content?.[0];
		expect(node?.type).toBe('figureBlock');
		expect(node?.attrs).toMatchObject({ caption: 'Round trip', level: 3 });

		cleanup();
	});
});

describe('block node view attribute updates', () => {
	it('preserves the input element and its focus while typing updates attributes', async () => {
		const { editor, host, cleanup } = createEditor({
			type: 'doc',
			content: [{ type: 'callout', attrs: { title: '' } }]
		});

		const input = host.querySelector<HTMLInputElement>('[data-testid="title-input"]');
		expect(input).not.toBeNull();

		// Each keystroke calls updateAttributes, which dispatches a transaction
		// and triggers NodeView.update with the changed attrs.
		await userEvent.type(page.elementLocator(input!), 'Hi');

		await expect.poll(() => editor.getJSON().content?.[0]?.attrs?.title).toBe('Hi');

		// The component must be updated in place, not destroyed and remounted:
		// the input keeps its DOM identity, focus, and value.
		expect(host.querySelector('[data-testid="title-input"]')).toBe(input);
		expect(document.activeElement).toBe(input);
		expect(input!.value).toBe('Hi');

		// Props propagated into the mounted component without a remount.
		await expect
			.poll(() => host.querySelector('[data-testid="fixture-title"]')?.textContent)
			.toBe('Hi');

		cleanup();
	});
});
