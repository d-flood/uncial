import { describe, expect, it } from 'vitest';
import type { Editor as TiptapEditor, JSONContent } from '@tiptap/core';
import { bindEditor, type BindEditorOptions } from './bindEditor.js';
import { createBlockRegistry, createSchema } from '../core/registry.js';
import { CURRENT_DOCUMENT_VERSION } from '../core/migrations.js';
import type { ValidationIssue } from '../core/types.js';

interface BindHarness {
	host: HTMLElement;
	issues: ValidationIssue[];
	changes: JSONContent[];
	editor(): TiptapEditor;
	update(next: BindEditorOptions): void;
	cleanup(): void;
}

function bindHarness(options: BindEditorOptions): BindHarness {
	const host = document.createElement('div');
	document.body.append(host);
	const issues: ValidationIssue[] = [];
	const changes: JSONContent[] = [];
	let boundEditor: TiptapEditor | null = null;

	const instrument = (opts: BindEditorOptions): BindEditorOptions => ({
		...opts,
		onIssue: (issue) => issues.push(issue),
		onChange: (next) => changes.push(next),
		onEditor: (next) => {
			boundEditor = next;
		}
	});

	const action = bindEditor(host, instrument(options));

	return {
		host,
		issues,
		changes,
		editor() {
			if (!boundEditor) throw new Error('editor was not attached');
			return boundEditor;
		},
		update(next) {
			action.update?.(instrument(next));
		},
		cleanup() {
			action.destroy?.();
			host.remove();
		}
	};
}

function appendParagraph(editor: TiptapEditor, text: string): void {
	editor.commands.insertContentAt(editor.state.doc.content.size, {
		type: 'paragraph',
		content: [{ type: 'text', text }]
	});
}

describe('bindEditor content guard', () => {
	it('keeps sibling paragraphs when the initial doc contains an unknown block', async () => {
		// Core normalization deliberately preserves unknown block types
		// (UNKNOWN_BLOCK is a warning), but Tiptap replaces the whole document
		// with empty content when the initial content has a node type missing
		// from the editor schema. The guard must strip only the unknown node.
		const harness = bindHarness({
			json: {
				type: 'doc',
				version: 1,
				content: [
					{ type: 'paragraph', content: [{ type: 'text', text: 'First paragraph' }] },
					{ type: 'mysteryEmbed', attrs: { src: 'https://example.com/embed' } },
					{ type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph' }] }
				]
			} as JSONContent
		});

		// Both sibling paragraphs render; the document was not wiped.
		expect(harness.host.textContent).toContain('First paragraph');
		expect(harness.host.textContent).toContain('Second paragraph');
		expect(harness.editor().getJSON().content?.map((node) => node.type)).toEqual([
			'paragraph',
			'paragraph'
		]);

		// The stripped node was reported to the host as a warning.
		const strip = harness.issues.find((issue) => issue.details?.block === 'mysteryEmbed');
		expect(strip?.code).toBe('UNKNOWN_BLOCK');
		expect(strip?.severity).toBe('warning');
		expect(strip?.path).toEqual(['content', 1]);

		// No emitted document is empty or missing the paragraphs.
		for (const change of harness.changes) {
			expect(change.content?.length ?? 0).toBeGreaterThan(0);
			expect(JSON.stringify(change)).toContain('First paragraph');
			expect(JSON.stringify(change)).toContain('Second paragraph');
		}

		// After a real edit the host still receives a non-empty document with
		// the surviving paragraphs intact.
		appendParagraph(harness.editor(), 'Third paragraph');

		await expect.poll(() => harness.changes.length).toBeGreaterThan(0);
		const latest = harness.changes.at(-1) as JSONContent;
		expect(latest.content?.length ?? 0).toBeGreaterThan(0);
		expect(JSON.stringify(latest)).toContain('First paragraph');
		expect(JSON.stringify(latest)).toContain('Second paragraph');
		expect(JSON.stringify(latest)).toContain('Third paragraph');

		harness.cleanup();
	});

	it('warns about future document versions, renders the doc, and re-stamps after a real edit', async () => {
		const registry = createBlockRegistry([]);
		const schema = createSchema(registry);
		const harness = bindHarness({
			blocks: registry,
			schema,
			json: {
				type: 'doc',
				version: 99,
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Future copy' }] }]
			} as JSONContent
		});

		// The host is warned that the document comes from a newer version.
		const unsupported = harness.issues.find((issue) => issue.code === 'UNSUPPORTED_VERSION');
		expect(unsupported?.severity).toBe('warning');
		expect(unsupported?.details).toMatchObject({
			version: 99,
			supportedVersion: CURRENT_DOCUMENT_VERSION
		});

		// The document still renders.
		expect(harness.host.textContent).toContain('Future copy');

		// Loading alone never downgrades the stored version.
		for (const change of harness.changes) {
			expect((change as { version?: number }).version).toBe(99);
		}

		// After a real editor update the emitted document carries the current
		// version and keeps the original content.
		appendParagraph(harness.editor(), 'Edited copy');

		await expect.poll(() => harness.changes.length).toBeGreaterThan(0);
		const latest = harness.changes.at(-1) as JSONContent;
		expect((latest as { version?: number }).version).toBe(CURRENT_DOCUMENT_VERSION);
		expect(JSON.stringify(latest)).toContain('Future copy');
		expect(JSON.stringify(latest)).toContain('Edited copy');

		harness.cleanup();
	});
});

describe('bindEditor editor recreation', () => {
	it('keeps the same Tiptap instance across an external update with stable references', async () => {
		const blocks = createBlockRegistry([]);
		const schema = createSchema(blocks);
		const extensions: BindEditorOptions['extensions'] = [];
		const harness = bindHarness({
			blocks,
			schema,
			extensions,
			json: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Stable' }] }]
			} as JSONContent
		});

		const before = harness.editor();

		// A host that re-renders and passes a fresh options object but the SAME
		// blocks/schema/extensions references (the documented contract) must not
		// remount the editor even though `json` is a new object each time.
		harness.update({
			blocks,
			schema,
			extensions,
			json: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Stable edit' }] }]
			} as JSONContent
		});

		expect(harness.editor()).toBe(before);
		expect(harness.host.textContent).toContain('Stable edit');

		harness.cleanup();
	});

	it('recreates the editor when the blocks reference changes', async () => {
		const first = createBlockRegistry([]);
		const harness = bindHarness({
			blocks: first,
			schema: createSchema(first),
			json: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Recreate' }] }]
			} as JSONContent
		});

		const before = harness.editor();

		const second = createBlockRegistry([]);
		harness.update({
			blocks: second,
			schema: createSchema(second),
			json: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Recreate' }] }]
			} as JSONContent
		});

		expect(harness.editor()).not.toBe(before);

		harness.cleanup();
	});

	it('re-validates metadata on a body-unchanged update', async () => {
		const blocks = createBlockRegistry([]);
		const schema = createSchema(blocks, {
			metaFields: { title: { default: '', required: true } }
		});
		const body = {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }]
		};
		const harness = bindHarness({
			blocks,
			schema,
			meta: { title: 'Present' },
			json: { ...body, meta: { title: 'Present' } } as JSONContent
		});

		// Valid to begin with.
		expect(harness.issues.some((issue) => issue.code === 'INVALID_META')).toBe(false);

		// Metadata-only change that violates the required field; the body is
		// byte-identical, so the guard must still key on the full document to
		// re-validate — otherwise the missing-required-field issue is dropped.
		harness.update({
			blocks,
			schema,
			meta: {},
			json: { ...body, meta: {} } as JSONContent
		});

		expect(harness.issues.some((issue) => issue.code === 'INVALID_META')).toBe(true);

		harness.cleanup();
	});

	it('skips the validate pass when the host echoes an unchanged document back', async () => {
		const blocks = createBlockRegistry([]);
		const schema = createSchema(blocks);
		const extensions: BindEditorOptions['extensions'] = [];
		// A future-version doc emits exactly one UNSUPPORTED_VERSION warning per
		// validate pass, so the issue count is a direct probe of how often the
		// document is validated.
		const doc = {
			type: 'doc',
			version: 99,
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Echoed' }] }]
		} as JSONContent;
		const harness = bindHarness({ blocks, schema, extensions, json: doc });

		const countVersionWarnings = () =>
			harness.issues.filter((issue) => issue.code === 'UNSUPPORTED_VERSION').length;
		expect(countVersionWarnings()).toBe(1);

		// The host re-renders and passes the same document straight back. The
		// serialized-content guard must short-circuit before re-validating, so
		// no second UNSUPPORTED_VERSION warning is produced.
		harness.update({ blocks, schema, extensions, json: doc });

		expect(countVersionWarnings()).toBe(1);

		harness.cleanup();
	});
});
