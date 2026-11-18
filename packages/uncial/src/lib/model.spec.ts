import { describe, expect, it } from 'vitest';
import { generateHTML, generateJSON } from '@tiptap/html';
import type { AnyExtension } from '@tiptap/core';
import type { Component } from 'svelte';
import { render } from 'svelte/server';
import {
	Renderer,
	createContentModel,
	defineBlock,
	defineRuntimeBlock,
	normalizeDocument,
	toHtml,
	toPlainText,
	validateDocument,
	type ContentDocument
} from './index.js';
import { createBlockRegistry, createSchema } from './core/registry.js';
import { CURRENT_DOCUMENT_VERSION } from './core/migrations.js';
import { richTextDocument } from './shared/richText.js';
import { svelteRuntime } from './runtime/svelte.js';
import {
	coerceAttributeValue,
	normalizeBlockAttributes,
	toAttributeDrafts
} from './core/attributes.js';
import { createEditorExtensions } from './shared/tiptap.js';
import { smallCaps } from './render/smallCapsMarkFixture.js';

const Dummy = (() => ({})) as unknown as Component<Record<string, unknown>>;
const module = (block: unknown) => ({ default: Dummy, block });

const model = createContentModel({
	base: '/x',
	blocks: {
		'./blocks/Hero.svelte': module(
			defineBlock({
				id: 'hero',
				label: 'Hero',
				attributes: {
					headline: '',
					height: { default: 'standard', options: ['standard', 'full'] },
					rating: { default: null, input: 'number' },
					page: { default: null, input: 'item-page' },
					tags: { default: '', input: 'tag-picker' },
					image: { default: null, input: 'image' },
					download: { default: null, input: 'file' },
					body: { default: richTextDocument(''), input: 'richtext' },
					links: { default: [], list: { fields: { label: '', href: '' } } }
				}
			})
		),
		'./blocks/Section.svelte': module(
			defineBlock({ id: 'section', label: 'Section', attributes: {}, content: { kind: 'flow' } })
		)
	},
	marks: [smallCaps],
	meta: {
		title: { default: 'Untitled', required: true },
		order: { default: null, input: 'number' }
	}
});
const schema = model.schemaFor();
const normalize = (doc: unknown) => normalizeDocument(doc as ContentDocument, model.blocks, schema);
const hero = model.blocks.get('hero')!;

const heroAttrs = {
	headline: 'Welcome',
	height: 'full',
	rating: 4,
	page: { id: 7, title: 'Chapter 1', path: ['book', 'one'] },
	tags: [{ slug: 'iiif' }, { slug: 'pwa' }],
	image: { src: '/uploads/cover.jpg', focal: { x: 0.25, y: 0.75 }, alt: 'A cover' },
	download: { src: '/uploads/a.pdf', name: 'a.pdf', size: 1024, type: 'application/pdf' },
	body: richTextDocument('Body copy'),
	links: [{ label: 'Docs', href: '/docs' }]
};

const markedParagraph = {
	type: 'paragraph',
	content: [{ type: 'text', text: 'Bold', marks: [{ type: 'bold' }, { type: 'smallCaps' }] }]
};

const document = {
	type: 'doc',
	meta: { title: 'Home', order: 3 },
	content: [
		{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Hello World' }] },
		{
			type: 'section',
			content: [{ type: 'hero', attrs: heroAttrs }, markedParagraph]
		}
	]
};

function withoutIds(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(withoutIds);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => key !== 'id')
			.map(([key, entry]) => [key, withoutIds(entry)])
	);
}

describe('model round trip', () => {
	const normalized = normalize(document);

	it('keeps every attribute and meta value as declared', () => {
		expect(normalized.meta).toEqual({ title: 'Home', order: 3 });
		expect(normalized.content?.[1]?.content?.[0]?.attrs).toEqual({
			...heroAttrs,
			id: expect.any(String)
		});
		expect(normalized.content?.[0]?.attrs).toMatchObject({ slug: 'hello-world' });
		expect(validateDocument(normalized, model.blocks, schema)).toEqual({ ok: true, issues: [] });
	});

	it('survives serialize, parse and normalize unchanged', () => {
		expect(normalize(JSON.parse(JSON.stringify(normalized)))).toEqual(normalized);
	});

	it('survives the editor’s HTML render and parse', async () => {
		const mark = (await smallCaps.extension()) as AnyExtension;
		const extensions = createEditorExtensions(model.blocks, schema, undefined, [mark]);
		const parsed = generateJSON(generateHTML(normalized, extensions), extensions);
		expect(withoutIds(normalize({ ...parsed, meta: normalized.meta }))).toEqual(
			withoutIds(normalized)
		);
	});

	it('serializes to the Renderer’s HTML, Marks and base included, and to collapsed text', () => {
		const link = { type: 'link', attrs: { href: '/docs/' } };
		const content: ContentDocument = {
			type: 'doc',
			content: [
				markedParagraph,
				{
					type: 'paragraph',
					content: [{ type: 'text', text: '  Read\n the docs ', marks: [link] }]
				}
			]
		};
		const html = toHtml(content, model);
		const { body } = render(Renderer, { props: { content, model } });
		expect(html).toBe(body.replace(/<!--[\s\S]*?-->/g, ''));
		expect(html).toContain('<strong><span data-small-caps="">Bold</span></strong>');
		expect(html).toContain('<a href="/x/docs/">');
		expect(toPlainText(content)).toBe('Bold Read the docs');
	});

	it('survives the attributes panel’s draft and parse', () => {
		const attrs = normalizeBlockAttributes(hero, { ...heroAttrs, page: null });
		expect(normalizeBlockAttributes(hero, toAttributeDrafts(hero, attrs))).toEqual(attrs);
	});

	it('stores null for an emptied nullable number and a number otherwise', () => {
		const spec = hero.attributes.rating;
		expect(coerceAttributeValue(spec, '')).toBeNull();
		expect(coerceAttributeValue(spec, '7')).toBe(7);
		expect(normalize({ type: 'doc', meta: { order: '' } }).meta).toEqual({
			title: 'Untitled',
			order: null
		});
	});

	it('keeps ids across reordering and renormalizing', () => {
		const reordered = normalize({ ...normalized, content: [...normalized.content!].reverse() });
		expect(reordered.content?.map((node) => node.attrs?.id)).toEqual(
			[...normalized.content!].reverse().map((node) => node.attrs?.id)
		);
	});
});

describe('image alt text', () => {
	const altModel = createContentModel({
		blocks: [
			defineRuntimeBlock(svelteRuntime, {
				id: 'figure',
				label: 'Figure',
				attributes: {
					image: { default: null, input: 'image' },
					plain: { default: null, input: 'image', image: { alt: false } },
					url: { default: '', input: 'image' },
					gallery: {
						default: [],
						list: { fields: { image: { default: null, input: 'image' } } }
					}
				},
				component: Dummy
			})
		],
		meta: { banner: { default: null, input: 'image' } }
	});
	const issuesOf = (attrs: Record<string, unknown>, meta: Record<string, unknown> = {}) =>
		validateDocument(
			{ type: 'doc', meta, content: [{ type: 'figure', attrs: { id: 'f', ...attrs } }] },
			altModel.blocks,
			altModel.schemaFor()
		).issues.map(({ code, path }) => ({ code, path }));

	it('requires alt text of an image unless it is decorative', () => {
		expect(issuesOf({ image: { src: '/a.png' } })).toEqual([
			{ code: 'INVALID_ATTR', path: ['content', 0, 'attrs', 'image'] }
		]);
		expect(issuesOf({ image: { src: '/a.png', alt: '  ' } })).toHaveLength(1);
		expect(issuesOf({ image: { src: '/a.png', alt: 'A school' } })).toEqual([]);
		expect(issuesOf({ image: { item: 'a', page: 1, decorative: true } })).toEqual([]);
	});

	it('requires none of an attribute that opts out, a URL or an empty field', () => {
		expect(issuesOf({ plain: { src: '/a.png' }, url: '/a.png', image: null })).toEqual([]);
	});

	it('requires alt text of an image in a list and in metadata', () => {
		expect(
			issuesOf(
				{ gallery: [{ image: { src: '/a.png', alt: 'A' } }, { image: { src: '/b.png' } }] },
				{
					banner: { src: '/c.png' }
				}
			)
		).toEqual([
			{ code: 'INVALID_META', path: ['meta', 'banner'] },
			{ code: 'INVALID_ATTR', path: ['content', 0, 'attrs', 'gallery', 1, 'image'] }
		]);
	});
});

describe('createContentModel', () => {
	it('names a Block module without a `block` export', () => {
		expect(() =>
			createContentModel({ blocks: { './blocks/Stray.svelte': { default: Dummy } } })
		).toThrow(/"\.\/blocks\/Stray\.svelte" has no `block` export/);
	});

	it('rejects duplicate ids, mixed runtimes and unregistered child ids', () => {
		const declare = (id: string, content?: { kind: 'flow'; allowedBlocks: string[] }) =>
			module(defineBlock({ id, label: id, attributes: {}, content }));
		expect(() =>
			createContentModel({ blocks: { './A.svelte': declare('a'), './B.svelte': declare('a') } })
		).toThrow(/Duplicate block id "a"/);
		expect(() =>
			createContentModel({
				blocks: { './Tabs.svelte': declare('tabs', { kind: 'flow', allowedBlocks: ['tab'] }) }
			})
		).toThrow(/unregistered child block id\(s\): "tab"/);

		const fake = {
			id: 'fake',
			defineComponent: (component: unknown) => ({ runtime: 'fake', component, plugin: fake })
		};
		const custom = defineRuntimeBlock(fake, {
			id: 'custom',
			label: 'Custom',
			attributes: {},
			component: {}
		});
		const svelte = defineRuntimeBlock(svelteRuntime, {
			id: 's',
			label: 'S',
			attributes: {},
			component: Dummy
		});
		expect(() => createContentModel({ blocks: [svelte, custom] })).toThrow(/cannot mix runtimes/);
	});

	it('rejects ambiguous attribute and list declarations', () => {
		const register = (attributes: Record<string, unknown>) =>
			createContentModel({ blocks: { './X.svelte': module({ id: 'x', label: 'X', attributes }) } });
		expect(() => register({ size: { input: 'number' } })).toThrow(/does not define a "default"/);
		expect(() => register({ meta: { required: true, note: 'x' } })).toThrow(/wrap it explicitly/);
		expect(() => register({ rows: { default: [], list: {} } })).toThrow(/neither "list.fields"/);
		expect(() =>
			createContentModel({ blocks: [], meta: { footer: { default: [], list: {} } } })
		).toThrow(/Metadata field "footer" declares "list"/);
	});

	it('uses the render component for a read-only block and keeps its attrs byte-for-byte', () => {
		const Render = (() => ({})) as unknown as Component<Record<string, unknown>>;
		const table = defineRuntimeBlock(svelteRuntime, {
			id: 'generatedTable',
			label: 'Generated table',
			readOnly: true,
			attributes: { rows: '' },
			components: { editor: Dummy, render: Render }
		});
		expect(table.components.editor.component).toBe(Render);
		const attrs = '{"id":"t","columns":"Status  \\n","rows":"A | B\\n"}';
		const registry = createBlockRegistry([table]);
		const doc = normalizeDocument(
			{ type: 'doc', content: [{ type: 'generatedTable', attrs: JSON.parse(attrs) }] },
			registry
		);
		expect(JSON.stringify(doc.content?.[0]?.attrs)).toBe(attrs);
	});
});

describe('normalizeDocument', () => {
	it('coerces typed attrs, keeps empty strings and drops what the schema does not declare', () => {
		const doc = normalize({
			type: 'doc',
			meta: { title: 42, extra: true },
			content: [
				{
					type: 'hero',
					attrs: { headline: '', height: 7, rating: '5', body: 'Plain', ignored: 'x' },
					content: [{ type: 'paragraph' }]
				},
				{
					type: 'paragraph',
					content: [
						{ type: 'text', text: 'Hi', marks: [{ type: 'bold' }, { type: 'superscript' }] }
					]
				}
			]
		});
		const attrs = doc.content?.[0];
		expect(doc.meta).toEqual({ title: '42', order: null });
		expect(attrs?.attrs).toMatchObject({
			headline: '',
			height: '7',
			rating: 5,
			body: richTextDocument('Plain')
		});
		expect(attrs?.attrs).not.toHaveProperty('ignored');
		expect(attrs?.content).toBeUndefined();
		expect(doc.content?.[1]?.content?.[0]?.marks).toEqual([{ type: 'bold' }]);
		expect(normalizeDocument({ type: 'doc', meta: { title: 'x' } }, [])).not.toHaveProperty('meta');
	});

	it('clones object defaults so instances never share a reference', () => {
		const spec = { default: { nested: { value: 1 } } };
		const a = coerceAttributeValue(spec, undefined);
		a.nested.value = 99;
		expect(coerceAttributeValue(spec, 123)).toEqual({ nested: { value: 1 } });
	});

	it('drops malformed nodes, marks and text without throwing', () => {
		for (const input of [null, 'garbage', 42, []]) {
			expect(normalize(input)).toMatchObject({ version: CURRENT_DOCUMENT_VERSION, content: [] });
		}
		const doc = normalize({
			type: 'doc',
			content: [
				null,
				42,
				{ type: 'paragraph', marks: 'bold', content: 'nope', attrs: 7 },
				{ type: 'hero', attrs: 'nope' },
				{
					type: 'blockquote',
					content: [
						{
							type: 'paragraph',
							content: [
								{ type: 'text' },
								{ type: 'text', text: '' },
								{ type: 42 },
								{ type: 'text', text: 'Kept', marks: [null, { type: 'bold', attrs: 'x' }] }
							]
						}
					]
				}
			]
		});
		expect(withoutIds(doc.content)).toMatchObject([
			{ type: 'paragraph' },
			{ type: 'hero', attrs: { headline: '' } },
			{
				type: 'blockquote',
				content: [
					{
						type: 'paragraph',
						content: [{ type: 'text', text: 'Kept', marks: [{ type: 'bold' }] }]
					}
				]
			}
		]);
	});
});

describe('document versioning', () => {
	const doc = (version: unknown) => normalize({ type: 'doc', version, content: [] }).version;

	it('stamps bogus versions current and keeps future ones', () => {
		for (const version of [undefined, '2', Number.NaN, 0, -1e15, 1.5, 1e300]) {
			expect(doc(version)).toBe(CURRENT_DOCUMENT_VERSION);
		}
		expect(doc(CURRENT_DOCUMENT_VERSION + 5)).toBe(CURRENT_DOCUMENT_VERSION + 5);
	});
});

describe('validateDocument', () => {
	it('reports disallowed blocks, invalid attrs and content, and malformed nodes', () => {
		const strict = createSchema(model.blocks, { allowedBlocks: ['section'] });
		const codes = validateDocument(
			{
				type: 'doc',
				content: [
					{ type: 'hero', attrs: { height: 'tiny' }, content: [{ type: 'paragraph' }] },
					{ type: 'mystery' },
					{ type: 'paragraph', marks: 'bold' }
				]
			} as never,
			model.blocks,
			strict
		).issues.map((issue) => [issue.code, issue.path.join('.'), issue.severity]);
		expect(codes).toEqual(
			expect.arrayContaining([
				['DISALLOWED_BLOCK', 'content.0', 'error'],
				['INVALID_ATTR', 'content.0.attrs.height', 'error'],
				['INVALID_CONTENT', 'content.0.content', 'error'],
				['UNKNOWN_BLOCK', 'content.1', 'warning'],
				['MALFORMED_NODE', 'content.2.marks', 'error']
			])
		);
	});

	it('reports metadata issues at their full path', () => {
		const metaSchema = createSchema(model.blocks, {
			metaFields: {
				title: { default: '', required: true },
				footer: {
					default: [],
					list: { fields: { heading: { default: '', required: true } } }
				}
			}
		});
		const issues = validateDocument(
			{ type: 'doc', meta: { title: '', footer: [{ heading: 'A' }, { heading: '' }], extra: 1 } },
			model.blocks,
			metaSchema
		).issues.map((issue) => [issue.code, issue.path.join('.')]);
		expect(issues).toEqual(
			expect.arrayContaining([
				['INVALID_META', 'meta.title'],
				['INVALID_META', 'meta.footer.1.heading'],
				['UNKNOWN_META', 'meta.extra']
			])
		);
	});
});
