import { describe, expect, it } from 'vitest';
import { createBlockRegistry, createSchema, normalizeDocument } from './index.js';
import { defineSvelteBlock } from '../runtime/svelte.js';
import type { Component } from 'svelte';

const Dummy = (() => ({})) as unknown as Component<Record<string, unknown>>;

describe('normalizeDocument', () => {
	it('coerces typed attrs and strips unknown block attrs', () => {
		const profile = defineSvelteBlock({
			id: 'profile',
			label: 'Profile',
			attributes: {
				name: '',
				featured: false,
				order: 0,
				metadata: { default: { tone: 'warm' }, input: 'json' }
			},
			component: Dummy
		});

		const registry = createBlockRegistry([profile]);
		const schema = createSchema(registry);
		const normalized = normalizeDocument(
			{
				type: 'doc',
				content: [
					{
						type: 'profile',
						attrs: {
							name: 42,
							featured: 'true',
							order: '7',
							metadata: '{"tone":"cool"}',
							ignored: 'nope'
						}
					}
				]
			},
			registry,
			schema
		);

		expect(normalized.content?.[0]?.attrs).toEqual({
			name: '42',
			featured: true,
			order: 7,
			metadata: { tone: 'cool' }
		});
	});

	it('filters disallowed marks while preserving the document shape', () => {
		const registry = createBlockRegistry([]);
		const schema = createSchema(registry, { allowedMarks: ['bold'] });
		const normalized = normalizeDocument(
			{
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{
								type: 'text',
								text: 'Hello',
								marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://example.com' } }]
							}
						]
					}
				]
			},
			registry,
			schema
		);

		expect(normalized.content?.[0]?.content?.[0]?.marks).toEqual([{ type: 'bold' }]);
	});

	it('strips child content from atomic custom blocks', () => {
		const note = defineSvelteBlock({
			id: 'note',
			label: 'Note',
			attributes: { title: '' },
			component: Dummy
		});

		const registry = createBlockRegistry([note]);
		const schema = createSchema(registry);
		const normalized = normalizeDocument(
			{
				type: 'doc',
				content: [
					{
						type: 'note',
						attrs: { title: 'Atomic' },
						content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ignored' }] }]
					}
				]
			},
			registry,
			schema
		);

		expect(normalized.content?.[0]?.content).toBeUndefined();
	});

	it('preserves child content for container custom blocks', () => {
		const collapsible = defineSvelteBlock({
			id: 'collapsible',
			label: 'Collapsible',
			attributes: { title: '' },
			component: Dummy,
			content: { kind: 'flow' }
		});

		const registry = createBlockRegistry([collapsible]);
		const schema = createSchema(registry);
		const normalized = normalizeDocument(
			{
				type: 'doc',
				content: [
					{
						type: 'collapsible',
						attrs: { title: 'Details' },
						content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested' }] }]
					}
				]
			},
			registry,
			schema
		);

		expect(normalized.content?.[0]?.content).toEqual([
			{
				type: 'paragraph',
				content: [{ type: 'text', text: 'Nested' }]
			}
		]);
	});
});
