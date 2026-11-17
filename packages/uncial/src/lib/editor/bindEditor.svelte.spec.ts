import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Editor as TiptapEditor, JSONContent } from '@tiptap/core';
import { attachEditor, bindEditor, type AttachEditorOptions } from './bindEditor.js';
import { createBlockRegistry, createSchema } from '../core/registry.js';
import { CURRENT_DOCUMENT_VERSION } from '../core/migrations.js';
import { normalizeDocument } from '../core/normalize.js';
import type { DocumentMetaSchema, ValidationIssue } from '../core/types.js';
import { defineRuntimeBlock } from '../core/defineBlock.js';
import { svelteRuntime } from '../runtime/svelte.js';
import EditorBlockFixture from '../shared/EditorBlockFixture.svelte';
import TemplateFixture from '../shared/TemplateFixture.svelte';
import { createContentModel, defineTemplate } from '../model.js';
import Editor from './Editor.svelte';

const generatedTable = defineRuntimeBlock(svelteRuntime, {
	id: 'generatedTable',
	label: 'Generated table',
	readOnly: true,
	attributes: { rows: '', columns: '' },
	component: EditorBlockFixture
});

interface BindHarness {
	host: HTMLElement;
	issues: ValidationIssue[];
	changes: JSONContent[];
	editor(): TiptapEditor;
	update(next: AttachEditorOptions): void;
	cleanup(): void;
}

function bindHarness(options: AttachEditorOptions): BindHarness {
	const host = document.createElement('div');
	document.body.append(host);
	const issues: ValidationIssue[] = [];
	const changes: JSONContent[] = [];
	let boundEditor: TiptapEditor | null = null;

	const instrument = (opts: AttachEditorOptions): AttachEditorOptions => ({
		...opts,
		onIssue: (issue) => issues.push(issue),
		onChange: (next) => changes.push(next),
		onEditor: (next) => {
			boundEditor = next;
		}
	});

	const action = attachEditor(host, instrument(options));

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

describe('attachEditor content guard', () => {
	it('round-trips tables with inline code and links through normalization and serialization', async () => {
		const registry = createBlockRegistry([]);
		const schema = createSchema(registry);
		const table = {
			type: 'table',
			attrs: { id: 'api-reference' },
			content: [
				{
					type: 'tableRow',
					attrs: { id: 'api-reference-header' },
					content: [
						{
							type: 'tableHeader',
							attrs: { id: 'api-header', colspan: 1, rowspan: 1, colwidth: null },
							content: [
								{
									type: 'paragraph',
									attrs: { id: 'api-header-copy' },
									content: [{ type: 'text', text: 'API' }]
								}
							]
						}
					]
				},
				{
					type: 'tableRow',
					attrs: { id: 'api-reference-row' },
					content: [
						{
							type: 'tableCell',
							attrs: { id: 'api-cell', colspan: 1, rowspan: 1, colwidth: null },
							content: [
								{
									type: 'paragraph',
									attrs: { id: 'api-cell-copy' },
									content: [
										{ type: 'text', text: 'createSchema', marks: [{ type: 'code' }] },
										{ type: 'text', text: ' from ' },
										{
											type: 'text',
											text: 'the core API',
											marks: [{ type: 'link', attrs: { href: 'https://example.com/core' } }]
										}
									]
								}
							]
						}
					]
				}
			]
		};
		const normalized = normalizeDocument(
			{ type: 'doc', version: CURRENT_DOCUMENT_VERSION, content: [table] },
			registry,
			schema
		);

		expect(normalized.content?.[0]).toEqual(table);

		const harness = bindHarness({ blocks: registry, schema, json: normalized });
		appendParagraph(harness.editor(), 'An unrelated edit.');
		await expect.poll(() => harness.changes.length).toBeGreaterThan(0);

		expect(harness.changes.at(-1)?.content?.[0]).toMatchObject(table);

		harness.cleanup();
	});

	it('preserves read-only attributes byte-for-byte through an edit session', async () => {
		const registry = createBlockRegistry([generatedTable]);
		const schema = createSchema(registry);
		const attrs = '{"id":"content-state-table","columns":"Status  \\n","rows":"A | B\\n"}';
		const harness = bindHarness({
			blocks: registry,
			schema,
			json: {
				type: 'doc',
				version: CURRENT_DOCUMENT_VERSION,
				content: [
					{ type: 'generatedTable', attrs: JSON.parse(attrs) },
					{
						type: 'paragraph',
						attrs: { id: 'editable-copy' },
						content: [{ type: 'text', text: 'Editable copy.' }]
					}
				]
			} as JSONContent
		});

		appendParagraph(harness.editor(), 'An unrelated edit.');
		await expect.poll(() => harness.changes.length).toBeGreaterThan(0);

		expect(JSON.stringify(harness.changes.at(-1)?.content?.[0]?.attrs)).toBe(attrs);

		harness.cleanup();
	});

	it('assigns an id and slug to a heading created in the editor', async () => {
		const harness = bindHarness({
			json: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Existing copy.' }] }]
			} as JSONContent
		});

		harness.editor().commands.insertContentAt(harness.editor().state.doc.content.size, {
			type: 'heading',
			attrs: { level: 2 },
			content: [{ type: 'text', text: 'Created Heading' }]
		});

		await expect.poll(() => harness.changes.length).toBeGreaterThan(1);
		expect(harness.changes.at(-1)?.content?.[1]?.attrs).toMatchObject({
			id: expect.any(String),
			slug: 'created-heading'
		});

		harness.cleanup();
	});

	it('preserves a heading id and slug while its text is edited', async () => {
		const harness = bindHarness({
			json: {
				type: 'doc',
				content: [
					{
						type: 'heading',
						attrs: {
							id: 'heading-identity',
							level: 2,
							slug: 'adding-a-plugin-to-your-viewer'
						},
						content: [{ type: 'text', text: 'Adding a Plugin to Your Viewer' }]
					},
					{
						type: 'paragraph',
						attrs: { id: 'paragraph-identity' },
						content: [{ type: 'text', text: 'Body copy.' }]
					}
				]
			} as JSONContent
		});

		expect(harness.editor().getJSON().content?.[0]?.attrs).toMatchObject({
			id: 'heading-identity',
			slug: 'adding-a-plugin-to-your-viewer'
		});

		const heading = harness.editor().state.doc.firstChild;
		if (!heading) throw new Error('editor is missing the heading');
		harness
			.editor()
			.commands.insertContentAt({ from: 1, to: heading.nodeSize - 1 }, 'Install the Viewer Plugin');

		await expect.poll(() => harness.changes.length).toBeGreaterThan(1);
		const latest = harness.changes.at(-1) as JSONContent;
		expect(latest.content?.[0]?.attrs).toMatchObject({
			id: 'heading-identity',
			slug: 'adding-a-plugin-to-your-viewer'
		});
		expect(latest.content?.[1]?.attrs).toMatchObject({ id: 'paragraph-identity' });

		harness.cleanup();
	});

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
		expect(
			harness
				.editor()
				.getJSON()
				.content?.map((node) => node.type)
		).toEqual(['paragraph', 'paragraph']);

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

describe('attachEditor editor recreation', () => {
	it('keeps the same Tiptap instance across an external update with stable references', async () => {
		const blocks = createBlockRegistry([]);
		const schema = createSchema(blocks);
		const extensions: AttachEditorOptions['extensions'] = [];
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
		const extensions: AttachEditorOptions['extensions'] = [];
		// A future-version doc emits exactly one UNSUPPORTED_VERSION warning per
		// validate pass, so the issue count is a direct probe of how often the
		// document is validated.
		const doc = {
			type: 'doc',
			version: 99,
			content: [
				{
					type: 'paragraph',
					attrs: { id: 'echoed-paragraph' },
					content: [{ type: 'text', text: 'Echoed' }]
				}
			]
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

const templateModule = (id: string, meta?: DocumentMetaSchema) => ({
	default: TemplateFixture,
	template: defineTemplate({ id, label: id, meta })
});

describe('bindEditor', () => {
	it('gives Blocks the page and base, and the meta panel the template fields', async () => {
		const model = createContentModel({
			base: '/x',
			blocks: [
				defineRuntimeBlock(svelteRuntime, {
					id: 'fixture',
					label: 'Fixture',
					attributes: { title: '', image: { default: '', input: 'image' } },
					component: EditorBlockFixture
				})
			],
			templates: {
				'./Plain.svelte': templateModule('plain'),
				'./Banner.svelte': templateModule('banner', { banner: { default: '' } })
			}
		});
		const editor = bindEditor(model);
		const meta = { template: 'banner', banner: 'Hello' };
		const host = document.body.appendChild(document.createElement('div'));
		const content = [{ type: 'fixture', attrs: { image: '/a.png' } }];
		const action = editor.attach(host, { meta, json: { type: 'doc', meta, content } });
		await expect.poll(() => host.textContent).toContain('"image":"/x/a.png"');
		expect(host.textContent).toContain('"template":"banner"');
		expect(editor.meta.controller.commit().meta).toEqual(meta);
		action.destroy?.();
		host.remove();
	});
});

describe('Editor Page templates', () => {
	it('draws the template the metadata panel selects, with its fields, without a reload', async () => {
		const model = createContentModel({
			blocks: [],
			meta: { title: { default: 'Untitled' } },
			templates: {
				'./Plain.svelte': templateModule('plain'),
				'./Banner.svelte': templateModule('banner', {
					banner: { default: '', validate: (value) => value !== 'bad' }
				})
			}
		});
		const meta = { title: 'Home' };
		const paragraph = { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] };
		const screen = render(Editor, {
			model,
			meta,
			json: { type: 'doc', meta, content: [paragraph] }
		});
		const field = (name: string) => screen.getByLabelText(name, { exact: true });
		const shell = screen.getByTestId('template-shell');
		await expect.element(shell).toHaveTextContent('plain: Home');

		await screen.getByLabelText('Edit document metadata').click();
		await field('title').fill('Away');
		await expect.element(shell).toHaveTextContent('plain: Away');

		await field('template').selectOptions('banner');
		await expect.element(shell).toHaveTextContent('banner: Away');
		await screen.getByRole('button', { name: 'Save Metadata' }).click();
		await screen.getByLabelText('Edit document metadata').click();
		await expect.element(field('banner')).toBeVisible();
		await expect.element(screen.getByText('Body')).toBeVisible();

		await field('banner').fill('bad');
		await screen.getByLabelText('Edit document metadata').click();
		await screen.getByLabelText('Edit title').fill('Later');
		await screen.getByText('Body').click();
		await expect.element(field('banner')).toBeVisible();
	});
});
