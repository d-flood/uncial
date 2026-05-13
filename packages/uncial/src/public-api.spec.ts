import { describe, expect, it } from 'vitest';
import {
	CURRENT_DOCUMENT_VERSION,
	Editor,
	Renderer,
	bindEditor,
	createBlockAttributesController,
	createDocumentMetaController,
	createBlockRegistry,
	createSchema,
	defineSvelteBlock,
	normalizeDocument,
	normalizeMeta
} from './lib/index.js';
import type { Component } from 'svelte';

const Dummy = (() => ({})) as unknown as Component<Record<string, unknown>>;

describe('public api', () => {
	it('exports a usable block workflow from the package root', () => {
		const callout = defineSvelteBlock({
			id: 'callout',
			label: 'Callout',
			attributes: {
				title: '',
				featured: false,
				count: 0
			},
			component: Dummy
		});

		const registry = createBlockRegistry([callout]);
		const schema = createSchema(registry);
		const controller = createBlockAttributesController();
		const normalized = normalizeDocument(
			{
				type: 'doc',
				content: [{ type: 'callout', attrs: { title: 'Hello', featured: 'true', count: '2' } }]
			},
			registry,
			schema
		);

		expect(controller).toHaveProperty('commit');
		expect(normalized.version).toBe(CURRENT_DOCUMENT_VERSION);
		expect(Editor).toBeTruthy();
		expect(Renderer).toBeTruthy();
		expect(bindEditor).toBeTypeOf('function');
		expect(createDocumentMetaController).toBeTypeOf('function');
		expect(normalizeMeta).toBeTypeOf('function');
		expect(normalized.content?.[0]?.attrs).toEqual({
			title: 'Hello',
			featured: true,
			count: 2
		});
	});

	it('exposes the web component entrypoint', async () => {
		const webComponents = await import('./lib/web-components/index.js');

		expect(webComponents.UncialEditor).toBeTruthy();
		expect(webComponents.UncialRenderer).toBeTruthy();
	});
});
