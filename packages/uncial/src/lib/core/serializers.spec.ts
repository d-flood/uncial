import { describe, expect, it } from 'vitest';
import {
	normalizeBlockAttributes,
	serializeAttributeValue,
	serializeBlockAttributes,
	type AttributeDefinition
} from './attributes.js';
import { normalizeMeta, parseMetaDraftValues, serializeMeta, toMetaDraftValues } from './meta.js';
import type { AttributeSpec } from './types.js';

describe('serializeBlockAttributes', () => {
	const block: AttributeDefinition = {
		attributes: {
			caption: { default: '' },
			level: { default: 1 },
			featured: { default: false },
			tags: { default: [] as string[] },
			meta: { default: {} as Record<string, unknown> }
		}
	};

	it('round-trips through JSON to the normalized attributes when no custom serializer is set', () => {
		const attrs = {
			caption: 'Hello',
			level: 3,
			featured: true,
			tags: ['a', 'b'],
			meta: { x: 1 }
		};

		expect(JSON.parse(serializeBlockAttributes(block, attrs))).toEqual(
			normalizeBlockAttributes(block, attrs)
		);
	});

	it('fills declared-but-missing attributes with their defaults', () => {
		expect(JSON.parse(serializeBlockAttributes(block, { caption: 'only caption' }))).toEqual({
			caption: 'only caption',
			level: 1,
			featured: false,
			tags: [],
			meta: {}
		});
	});

	it('preserves an empty string instead of substituting the default, but restores the default when the key is missing', () => {
		expect(JSON.parse(serializeBlockAttributes({ attributes: { caption: { default: 'x' } } }, { caption: '' }))).toEqual({
			caption: ''
		});
		expect(JSON.parse(serializeBlockAttributes({ attributes: { caption: { default: 'x' } } }, {}))).toEqual({
			caption: 'x'
		});
	});

	it('applies a custom spec.serialize over the coerced value', () => {
		const withSerialize: AttributeDefinition = {
			attributes: {
				when: { default: 0, serialize: (value) => `S${value}` }
			}
		};

		expect(JSON.parse(serializeBlockAttributes(withSerialize, { when: 5 }))).toEqual({ when: 'S5' });
		// Missing → coerced to default (0), then serialized.
		expect(JSON.parse(serializeBlockAttributes(withSerialize, {}))).toEqual({ when: 'S0' });
	});

	it('drops attribute keys that are not declared on the block', () => {
		expect(JSON.parse(serializeBlockAttributes(block, { caption: 'a', bogus: 'nope' }))).not.toHaveProperty(
			'bogus'
		);
	});
});

describe('serializeAttributeValue', () => {
	it('returns the value unchanged when no serializer is declared', () => {
		const spec: AttributeSpec<number> = { default: 0 };
		expect(serializeAttributeValue(spec, 42)).toBe(42);
	});

	it('routes the value through spec.serialize when declared', () => {
		const spec: AttributeSpec<number> = { default: 0, serialize: (value) => `n:${value}` };
		expect(serializeAttributeValue(spec, 7)).toBe('n:7');
	});
});

describe('serializeMeta / parseMetaDraftValues', () => {
	const fields = new Map<string, AttributeSpec<unknown>>([
		['title', { default: '' }],
		['priority', { default: 0 }],
		['featured', { default: false }]
	]);

	it('serializeMeta coerces every declared field and equals normalizeMeta without custom serializers', () => {
		const meta = { title: 'Post', priority: '3', featured: 'yes' };
		expect(serializeMeta(fields, meta)).toEqual(normalizeMeta(meta, fields));
		expect(serializeMeta(fields, meta)).toEqual({ title: 'Post', priority: 3, featured: true });
	});

	it('serializeMeta fills missing fields with defaults and applies spec.serialize', () => {
		const withSerialize = new Map<string, AttributeSpec<unknown>>([
			['slug', { default: '', serialize: (value) => String(value).toUpperCase() }]
		]);
		expect(serializeMeta(withSerialize, { slug: 'abc' })).toEqual({ slug: 'ABC' });
		expect(serializeMeta(withSerialize, {})).toEqual({ slug: '' });
	});

	it('parseMetaDraftValues coerces draft strings back to typed values', () => {
		expect(parseMetaDraftValues(fields, { title: 'Hi', priority: '3', featured: 'true' })).toEqual({
			title: 'Hi',
			priority: 3,
			featured: true
		});
	});

	it('parseMetaDraftValues round-trips values produced by toMetaDraftValues', () => {
		const meta = { title: 'Round trip', priority: 9, featured: true };
		expect(parseMetaDraftValues(fields, toMetaDraftValues(fields, meta))).toEqual(
			normalizeMeta(meta, fields)
		);
	});

	it('parseMetaDraftValues ignores draft keys that are not declared fields', () => {
		expect(parseMetaDraftValues(fields, { title: 'X', extraneous: 'drop me' })).toEqual({
			title: 'X',
			priority: 0,
			featured: false
		});
	});
});
