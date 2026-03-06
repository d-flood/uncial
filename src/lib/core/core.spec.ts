import { describe, expect, it } from 'vitest';
import { createBlockRegistry, createSchema, defineBlock, validateDocument } from './index.js';
import type { ValidationIssue } from './types.js';
import type { Component } from 'svelte';

const Dummy = (() => ({})) as unknown as Component<Record<string, unknown>>;

describe('core', () => {
	it('defines block and normalizes shorthand attributes', () => {
		const image = defineBlock({
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
		expect(image.components.editor).toBe(Dummy);
		expect(image.components.render).toBe(Dummy);
	});

	it('normalizes partial component configs', () => {
		const block = defineBlock({
			id: 'note',
			label: 'Note',
			attributes: { body: '' },
			components: { editor: Dummy }
		});

		expect(block.components.editor).toBe(Dummy);
		expect(block.components.render).toBe(Dummy);
	});

	it('builds a registry and rejects duplicate ids', () => {
		const block = defineBlock({
			id: 'image',
			label: 'Image',
			attributes: { src: '' },
			components: { editor: Dummy, render: Dummy }
		});

		expect(() => createBlockRegistry([block, block])).toThrow(/Duplicate block id/);
	});

	it('validates document issues against schema', () => {
		const image = defineBlock({
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
});
