import { describe, expect, it } from 'vitest';
import {
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
	toAttributeDraftValue
} from './attributes.js';
import type { ValidationIssue } from './types.js';
import type { BlockRuntimePlugin } from './runtime.js';
import type { Component } from 'svelte';

const Dummy = (() => ({})) as unknown as Component<Record<string, unknown>>;

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
