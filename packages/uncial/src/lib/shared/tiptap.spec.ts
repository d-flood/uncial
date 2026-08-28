import { describe, expect, it } from 'vitest';
import { generateHTML, generateJSON } from '@tiptap/html';
import type { JSONContent } from '@tiptap/core';
import { createEditorExtensions } from './tiptap.js';
import { DEFAULT_MARKS, createBlockRegistry, createSchema } from '../core/registry.js';

const extensions = createEditorExtensions();

const linkAttrs = {
	href: 'https://example.com/docs',
	target: '_blank',
	rel: 'noopener noreferrer',
	title: 'Example docs',
	class: 'fancy-link'
};

const doc: JSONContent = {
	type: 'doc',
	content: [
		{
			type: 'paragraph',
			content: [{ type: 'text', text: 'Docs', marks: [{ type: 'link', attrs: linkAttrs }] }]
		}
	]
};

describe('LinkMark', () => {
	it('renders title and class attributes to html', () => {
		const html = generateHTML(doc, extensions);

		expect(html).toContain('href="https://example.com/docs"');
		expect(html).toContain('title="Example docs"');
		expect(html).toContain('class="fancy-link"');
	});

	it('round-trips link attributes through JSON -> HTML -> JSON', () => {
		const html = generateHTML(doc, extensions);
		const parsed = generateJSON(html, extensions) as JSONContent;

		const textNode = parsed.content?.[0]?.content?.[0];
		const linkMark = textNode?.marks?.find((mark) => mark.type === 'link');
		expect(linkMark?.attrs).toMatchObject(linkAttrs);
	});

	it('omits unset optional attributes from html output', () => {
		const html = generateHTML(
			{
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{
								type: 'text',
								text: 'Docs',
								marks: [{ type: 'link', attrs: { href: 'https://example.com' } }]
							}
						]
					}
				]
			},
			extensions
		);

		expect(html).toContain('href="https://example.com"');
		expect(html).not.toContain('title=');
		expect(html).not.toContain('class=');
	});
});

describe('default marks single source (slice 04 item 4)', () => {
	// The schema fallback and the editor's base extensions must draw the default
	// mark universe from the same `DEFAULT_MARKS` constant, so they cannot drift.
	it('createSchema falls back to exactly DEFAULT_MARKS', () => {
		const schema = createSchema(createBlockRegistry([]));
		expect(new Set(schema.allowedMarks)).toEqual(new Set(DEFAULT_MARKS));
	});

	it('base extensions with no schema enable the link mark from DEFAULT_MARKS', () => {
		// `link` is part of DEFAULT_MARKS; the schema-less editor must include the
		// LinkMark extension (the mark that has to be added explicitly).
		expect(DEFAULT_MARKS).toContain('link');
		const withDefault = createEditorExtensions();
		expect(withDefault.some((extension) => extension.name === 'link')).toBe(true);
	});

	it('drops the link mark when the schema disallows it', () => {
		const schema = createSchema(createBlockRegistry([]), {
			allowedMarks: ['bold', 'italic']
		});
		const extensions = createEditorExtensions([], schema);
		expect(extensions.some((extension) => extension.name === 'link')).toBe(false);
	});
});

describe('inline code combined with other marks', () => {
	/*
	 * Tiptap's Code ships `excludes: "_"`, which makes code+bold and code+link
	 * invalid in the editor's schema. ProseMirror drops a node it cannot
	 * represent rather than reporting it, so before this was fixed a document
	 * holding bold code lost the whole block on the round trip through the
	 * editor — silently, and under an autosave with no save step.
	 *
	 * The count is asserted, not just the marks: dropping the block is exactly
	 * what the failure looked like, so a test that only inspected surviving
	 * nodes would have passed against the bug.
	 */
	function roundTrip(marks: JSONContent['marks']): JSONContent {
		const input: JSONContent = {
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
				{ type: 'paragraph', content: [{ type: 'text', text: 'media-src', marks }] },
				{ type: 'paragraph', content: [{ type: 'text', text: 'after' }] }
			]
		};
		return generateJSON(generateHTML(input, extensions), extensions);
	}

	it('keeps a block whose code is also bold', () => {
		const out = roundTrip([{ type: 'code' }, { type: 'bold' }]);
		expect(out.content).toHaveLength(3);
		expect(out.content?.[1].content?.[0].marks?.map((m) => m.type).sort()).toEqual([
			'bold',
			'code'
		]);
	});

	it('keeps a block whose code is also a link', () => {
		const out = roundTrip([{ type: 'code' }, { type: 'link', attrs: linkAttrs }]);
		expect(out.content).toHaveLength(3);
		expect(out.content?.[1].content?.[0].marks?.map((m) => m.type).sort()).toEqual([
			'code',
			'link'
		]);
	});
});
