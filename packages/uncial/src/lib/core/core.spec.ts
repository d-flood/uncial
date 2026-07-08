import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	CURRENT_DOCUMENT_VERSION,
	coerceRichTextDocument,
	createBlockRegistry,
	createSchema,
	defineRuntimeBlock,
	hasRichTextContent,
	richTextDocument,
	resolveRichTextFeatures,
	validateDocument
} from './index.js';
import { defineSvelteBlock } from '../runtime/svelte.js';
import {
	coerceAttributeValue,
	inferAttributeInputKind,
	normalizeAttributeOptions,
	normalizeBlockAttributes,
	parseBlockDraftAttributes,
	toAttributeDraftValue
} from './attributes.js';
import type { ValidationIssue } from './types.js';
import type { BlockRuntimePlugin } from './runtime.js';
import type { Component } from 'svelte';

const Dummy = (() => ({})) as unknown as Component<Record<string, unknown>>;

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

const fakeRuntime: BlockRuntimePlugin<{ name: string }> = {
	id: 'fake',
	defineComponent(component) {
		return { runtime: 'fake', component, plugin: fakeRuntime };
	}
};

describe('core', () => {
	it('defines block and normalizes shorthand attributes', () => {
		const image = defineSvelteBlock({
			id: 'image',
			label: 'Image',
			attributes: {
				src: '',
				alt: { default: '', required: false }
			},
			component: Dummy
		});

		expect(image.attributes.src.default).toBe('');
		expect(image.attributes.alt.default).toBe('');
		expect(image.components.editor.component).toBe(Dummy);
		expect(image.components.render.component).toBe(Dummy);
		expect(image.runtime).toBe('svelte');
		expect(image.content).toBeUndefined();
	});

	it('defines container blocks with flow content', () => {
		const collapsible = defineSvelteBlock({
			id: 'collapsible',
			label: 'Collapsible',
			attributes: {
				title: ''
			},
			component: Dummy,
			content: { kind: 'flow' }
		});

		expect(collapsible.content).toEqual({ kind: 'flow' });
	});

	it('normalizes partial component configs', () => {
		const block = defineSvelteBlock({
			id: 'note',
			label: 'Note',
			attributes: { body: '' },
			components: { editor: Dummy }
		});

		expect(block.components.editor.component).toBe(Dummy);
		expect(block.components.render.component).toBe(Dummy);
	});

	it('builds a registry and rejects duplicate ids', () => {
		const block = defineSvelteBlock({
			id: 'image',
			label: 'Image',
			attributes: { src: '' },
			components: { editor: Dummy, render: Dummy }
		});

		expect(() => createBlockRegistry([block, block])).toThrow(/Duplicate block id/);
	});

	it('defines blocks with a custom runtime plugin', () => {
		const block = defineRuntimeBlock(fakeRuntime, {
			id: 'custom',
			label: 'Custom',
			attributes: { title: '' },
			component: { name: 'CustomComponent' }
		});

		expect(block.runtime).toBe('fake');
		expect(block.components.editor.runtime).toBe('fake');
		expect(block.components.render.component).toEqual({ name: 'CustomComponent' });
	});

	it('rejects mixed runtime registries', () => {
		const svelte = defineSvelteBlock({
			id: 'svelteBlock',
			label: 'Svelte Block',
			attributes: {},
			component: Dummy
		});
		const custom = defineRuntimeBlock(fakeRuntime, {
			id: 'customBlock',
			label: 'Custom Block',
			attributes: {},
			component: { name: 'CustomComponent' }
		});

		expect(() => createBlockRegistry([svelte, custom])).toThrow(/cannot mix runtimes/);
	});

	it('validates document issues against schema', () => {
		const image = defineSvelteBlock({
			id: 'image',
			label: 'Image',
			attributes: {
				src: {
					default: '',
					required: true,
					validate: (value: unknown): value is string =>
						typeof value === 'string' && value.length > 0
				}
			},
			components: { editor: Dummy, render: Dummy }
		});

		const registry = createBlockRegistry([image]);
		const schema = createSchema(registry, { allowedBlocks: [] });

		const result = validateDocument(
			{
				type: 'doc',
				content: [{ type: 'image', attrs: { src: '' } }]
			},
			registry,
			schema
		);

		expect(result.ok).toBe(false);
		expect(result.issues.some((issue: ValidationIssue) => issue.code === 'DISALLOWED_BLOCK')).toBe(
			true
		);
		expect(result.issues.some((issue: ValidationIssue) => issue.code === 'INVALID_ATTR')).toBe(
			true
		);
	});

	it('rejects child content on atomic custom blocks', () => {
		const image = defineSvelteBlock({
			id: 'image',
			label: 'Image',
			attributes: { src: '' },
			component: Dummy
		});

		const registry = createBlockRegistry([image]);
		const schema = createSchema(registry);
		const result = validateDocument(
			{
				type: 'doc',
				content: [
					{
						type: 'image',
						attrs: { src: 'cover.jpg' },
						content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nope' }] }]
					}
				]
			},
			registry,
			schema
		);

		expect(result.ok).toBe(false);
		expect(result.issues.some((issue: ValidationIssue) => issue.code === 'INVALID_CONTENT')).toBe(
			true
		);
	});

	it('flags malformed nodes, marks, and content as MALFORMED_NODE issues', () => {
		const registry = createBlockRegistry([]);
		const schema = createSchema(registry);

		const result = validateDocument(
			{
				type: 'doc',
				content: [
					null,
					{ type: 'paragraph', marks: 'bold' },
					{ type: 'paragraph', content: [{ type: 'text', marks: [null] }] },
					{ type: 'text' },
					{ type: 'paragraph', content: 'not-an-array' }
				]
			} as never,
			registry,
			schema
		);

		expect(result.ok).toBe(false);

		const malformedPaths = result.issues
			.filter((issue: ValidationIssue) => issue.code === 'MALFORMED_NODE')
			.map((issue: ValidationIssue) => issue.path);

		expect(malformedPaths).toContainEqual(['content', 0]);
		expect(malformedPaths).toContainEqual(['content', 1, 'marks']);
		expect(malformedPaths).toContainEqual(['content', 2, 'content', 0, 'marks', 0]);
		expect(malformedPaths).toContainEqual(['content', 3, 'text']);
		expect(malformedPaths).toContainEqual(['content', 4, 'content']);
	});

	it('warns about unknown block types without failing validation', () => {
		const registry = createBlockRegistry([]);
		const schema = createSchema(registry);

		const result = validateDocument(
			{ type: 'doc', content: [{ type: 'mysteryWidget' }] },
			registry,
			schema
		);

		expect(result.ok).toBe(true);

		const unknown = result.issues.find(
			(issue: ValidationIssue) => issue.code === 'UNKNOWN_BLOCK'
		);
		expect(unknown).toMatchObject({
			path: ['content', 0],
			severity: 'warning',
			details: { block: 'mysteryWidget' }
		});
	});

	it('warns about documents from a newer version via UNSUPPORTED_VERSION', () => {
		const registry = createBlockRegistry([]);
		const schema = createSchema(registry);
		const issues: ValidationIssue[] = [];

		const result = validateDocument(
			{ type: 'doc', version: CURRENT_DOCUMENT_VERSION + 1, content: [] },
			registry,
			schema,
			{ onIssue: (issue) => issues.push(issue) }
		);

		expect(result.ok).toBe(true);
		const unsupported = result.issues.find(
			(issue: ValidationIssue) => issue.code === 'UNSUPPORTED_VERSION'
		);
		expect(unsupported).toMatchObject({
			path: ['version'],
			severity: 'warning',
			details: {
				version: CURRENT_DOCUMENT_VERSION + 1,
				supportedVersion: CURRENT_DOCUMENT_VERSION
			}
		});
		expect(issues.some((issue) => issue.code === 'UNSUPPORTED_VERSION')).toBe(true);

		const current = validateDocument(
			{ type: 'doc', version: CURRENT_DOCUMENT_VERSION, content: [] },
			registry,
			schema
		);
		expect(
			current.issues.some((issue: ValidationIssue) => issue.code === 'UNSUPPORTED_VERSION')
		).toBe(false);
	});

	it('validates document metadata against schema fields', () => {
		const registry = createBlockRegistry([]);
		const schema = createSchema(registry, {
			metaFields: {
				title: { default: '', required: true, validate: isNonEmptyString },
				tags: { default: [] as string[], validate: Array.isArray }
			}
		});
		const issues: ValidationIssue[] = [];

		const result = validateDocument(
			{
				type: 'doc',
				meta: { title: '', tags: 'not-array', extra: true },
				content: []
			},
			registry,
			schema,
			{ onIssue: (issue) => issues.push(issue) }
		);

		expect(result.ok).toBe(false);
		expect(result.issues.some((issue) => issue.code === 'INVALID_META')).toBe(true);
		expect(result.issues.some((issue) => issue.code === 'UNKNOWN_META')).toBe(true);
		expect(issues).toHaveLength(result.issues.length);
	});

	it('coerces rich text documents from common input shapes', () => {
		const doc = richTextDocument('Hello world');

		expect(coerceRichTextDocument('Hello world')).toEqual(doc);
		expect(coerceRichTextDocument(JSON.stringify(doc))).toEqual(doc);
		expect(coerceRichTextDocument(doc)).toBe(doc);
		expect(hasRichTextContent(doc)).toBe(true);
		expect(hasRichTextContent(richTextDocument('   '))).toBe(false);
	});

	it('normalizes rich text attribute draft and parsed values as document objects', () => {
		const spec = {
			default: richTextDocument('Default'),
			input: 'richtext' as const
		};

		expect(inferAttributeInputKind(spec)).toBe('richtext');
		expect(coerceAttributeValue(spec, 'Draft')).toEqual(richTextDocument('Draft'));
		expect(toAttributeDraftValue(spec, 'Draft')).toEqual(richTextDocument('Draft'));
	});

	it('resolves rich text feature selections defensively', () => {
		expect([...resolveRichTextFeatures()]).toEqual([
			'bold',
			'italic',
			'bulletList',
			'orderedList',
			'hardBreak'
		]);
		expect([...resolveRichTextFeatures(['bold', 'code'])]).toEqual(['bold', 'code']);
		expect(resolveRichTextFeatures('*').has('blockquote')).toBe(true);
		expect(resolveRichTextFeatures('__all__').has('codeBlock')).toBe(true);
		expect(resolveRichTextFeatures('*').has('link')).toBe(false);
	});

	it('infers select input kind and auto-derives a validator from options', () => {
		const callout = defineSvelteBlock({
			id: 'callout',
			label: 'Callout',
			attributes: {
				tone: {
					default: 'info',
					options: ['info', 'success', 'warning', 'danger']
				}
			},
			component: Dummy
		});

		const toneSpec = callout.attributes.tone;

		expect(inferAttributeInputKind(toneSpec)).toBe('select');
		expect(toneSpec.validate).toBeTypeOf('function');
		expect(toneSpec.validate?.('success')).toBe(true);
		expect(toneSpec.validate?.('nope')).toBe(false);

		const normalized = normalizeAttributeOptions(toneSpec);
		expect(normalized).toEqual([
			{ value: 'info', label: 'info' },
			{ value: 'success', label: 'success' },
			{ value: 'warning', label: 'warning' },
			{ value: 'danger', label: 'danger' }
		]);
	});

	it('preserves explicit validate and accepts labeled options', () => {
		const ownValidate = (value: unknown): value is string => value === 'a' || value === 'b';
		const block = defineSvelteBlock({
			id: 'flags',
			label: 'Flags',
			attributes: {
				mode: {
					default: 'a',
					options: [
						{ value: 'a', label: 'Alpha' },
						{ value: 'b', label: 'Beta' }
					],
					validate: ownValidate
				}
			},
			component: Dummy
		});

		expect(block.attributes.mode.validate).toBe(ownValidate);
		expect(normalizeAttributeOptions(block.attributes.mode)).toEqual([
			{ value: 'a', label: 'Alpha', description: undefined },
			{ value: 'b', label: 'Beta', description: undefined }
		]);
	});
});

describe('core cleanups (slice 04)', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	// Item 1: the two names must resolve to one implementation.
	it('exposes parseBlockDraftAttributes as an alias of normalizeBlockAttributes', () => {
		expect(parseBlockDraftAttributes).toBe(normalizeBlockAttributes);

		const block = { attributes: { title: { default: '' }, count: { default: 0 } } };
		expect(parseBlockDraftAttributes(block, { title: 'Hi', count: '3' })).toEqual(
			normalizeBlockAttributes(block, { title: 'Hi', count: '3' })
		);
	});

	// Item 6: config-object vs shorthand-object-default discrimination.
	it('accepts a shorthand object as a default value', () => {
		const block = defineSvelteBlock({
			id: 'shape',
			label: 'Shape',
			attributes: {
				// No config keys → treated as an object-valued default.
				geometry: { width: 10, height: 20 }
			},
			component: Dummy
		});

		expect(block.attributes.geometry.default).toEqual({ width: 10, height: 20 });
	});

	it('rejects a configuration object that omits its default', () => {
		expect(() =>
			defineSvelteBlock({
				id: 'broken',
				label: 'Broken',
				attributes: {
					// `input` marks this as a config object, but there is no default.
					size: { input: 'number' }
				} as never,
				component: Dummy
			})
		).toThrow(/does not define a "default"/);
	});

	it('treats an object default that collides with a config key as ambiguous and errors', () => {
		expect(() =>
			defineSvelteBlock({
				id: 'ambiguous',
				label: 'Ambiguous',
				attributes: {
					// `required` is a config key, so this reads as a config missing a default.
					meta: { required: true, note: 'x' }
				} as never,
				component: Dummy
			})
		).toThrow(/wrap it explicitly/);
	});

	// Item 7a: empty string is a real value, not "missing".
	it('preserves an empty string instead of substituting the default', () => {
		const spec = { default: 'placeholder' };
		expect(coerceAttributeValue(spec, '')).toBe('');
		expect(coerceAttributeValue(spec, undefined)).toBe('placeholder');
		expect(coerceAttributeValue(spec, null)).toBe('placeholder');

		const block = { attributes: { caption: { default: 'placeholder' } } };
		expect(normalizeBlockAttributes(block, { caption: '' })).toEqual({ caption: '' });
	});

	// Item 7b: object/array defaults are cloned per instance, never shared.
	it('clones object and array defaults so instances never share a mutable reference', () => {
		const objectSpec = { default: { nested: { value: 1 } } };
		// `undefined` exercises the top-level missing-value branch...
		const a = coerceAttributeValue(objectSpec, undefined) as { nested: { value: number } };
		const b = coerceAttributeValue(objectSpec, undefined) as { nested: { value: number } };

		expect(a).toEqual({ nested: { value: 1 } });
		expect(a).not.toBe(b);
		expect(a).not.toBe(objectSpec.default);
		a.nested.value = 99;
		expect(b.nested.value).toBe(1);
		expect(objectSpec.default.nested.value).toBe(1);

		// ...and an uncoercible value (a number, for an object default) exercises the
		// object-type fallback branch, which must also clone.
		const fromBranch = coerceAttributeValue(objectSpec, 123) as { nested: { value: number } };
		expect(fromBranch).toEqual({ nested: { value: 1 } });
		expect(fromBranch).not.toBe(objectSpec.default);

		const arraySpec = { default: [1, 2, 3] };
		// A non-JSON string falls through to the array fallback branch.
		const arr = coerceAttributeValue(arraySpec, 'not-json') as number[];
		expect(arr).toEqual([1, 2, 3]);
		expect(arr).not.toBe(arraySpec.default);
		// `undefined` exercises the top-level branch for arrays too.
		const arrTop = coerceAttributeValue(arraySpec, undefined) as number[];
		expect(arrTop).not.toBe(arraySpec.default);
	});

	// Item 8b: hasRichTextContent narrows soundly (a bare string is not a PMDoc).
	it('reports hasRichTextContent only for real rich-text documents with text', () => {
		expect(hasRichTextContent(richTextDocument('Hello'))).toBe(true);
		expect(hasRichTextContent(richTextDocument('   '))).toBe(false);
		// A non-empty string has visible text but is NOT a PMDoc → must be false.
		expect(hasRichTextContent('Hello')).toBe(false);
		expect(hasRichTextContent(undefined)).toBe(false);
		expect(hasRichTextContent({ type: 'paragraph' })).toBe(false);
	});

	// Item 9: an explicitly requested `link` feature is warned about, not silently dropped.
	it('warns (not silently drops) when link is requested in rich-text features', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const resolved = resolveRichTextFeatures(['bold', 'link']);
		expect([...resolved]).toEqual(['bold']);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0][0]).toMatch(/link/);

		warn.mockClear();
		resolveRichTextFeatures(['bold', 'italic']);
		expect(warn).not.toHaveBeenCalled();

		// The implicit "all" selection excludes link by design and must not warn.
		resolveRichTextFeatures('*');
		expect(warn).not.toHaveBeenCalled();
	});

	// Item 10: createSchema surfaces unknown allowedBlocks ids.
	it('warns about unknown ids in allowedBlocks and keeps only known ones', () => {
		const known = defineSvelteBlock({
			id: 'known',
			label: 'Known',
			attributes: {},
			component: Dummy
		});
		const registry = createBlockRegistry([known]);

		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const schema = createSchema(registry, { allowedBlocks: ['known', 'ghost'] });

		expect([...schema.allowedBlocks]).toEqual(['known']);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0][0]).toMatch(/ghost/);

		warn.mockClear();
		createSchema(registry, { allowedBlocks: ['known'] });
		expect(warn).not.toHaveBeenCalled();
	});
});
