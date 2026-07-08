import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttributeOption } from 'uncial/core';

import { createBlocks, normalizeConfig, resolveToolbarExtensions } from './config.js';
import { createCalloutBlock } from './demoBlocks.js';

beforeEach(() => {
	delete window.uncialWagtail;
});

afterEach(() => {
	delete window.uncialWagtail;
	vi.restoreAllMocks();
});

describe('normalizeConfig', () => {
	it('parses the full config contract', () => {
		const config = normalizeConfig({
			allowedBlocks: ['wagtail.image', 'callout'],
			allowedMarks: ['bold', 'italic'],
			toolbarFeatures: ['bold'],
			toolbarExtensions: ['demo-feature'],
			customBlocks: ['callout'],
			imageRenditions: ['width-400'],
			apiUrls: {
				images: '/cms/api/uncial/images/',
				imagePreview: '/cms/api/uncial/images/0/preview/',
				chooserModal: '/cms/admin/images/chooser/'
			}
		});

		expect(config).toEqual({
			allowedBlocks: ['wagtail.image', 'callout'],
			allowedMarks: ['bold', 'italic'],
			toolbarFeatures: ['bold'],
			toolbarExtensions: ['demo-feature'],
			customBlocks: ['callout'],
			imageRenditions: ['width-400'],
			apiUrls: {
				images: '/cms/api/uncial/images/',
				imagePreview: '/cms/api/uncial/images/0/preview/',
				chooserModal: '/cms/admin/images/chooser/'
			}
		});
	});

	it('normalizes missing and malformed values to empty defaults', () => {
		expect(normalizeConfig({})).toEqual({
			allowedBlocks: [],
			allowedMarks: [],
			toolbarFeatures: [],
			toolbarExtensions: [],
			customBlocks: [],
			imageRenditions: [],
			apiUrls: {}
		});
		expect(normalizeConfig(null)).toEqual(normalizeConfig({}));
		expect(
			normalizeConfig({
				allowedBlocks: 'nope',
				customBlocks: [1, 'callout', null],
				toolbarExtensions: { key: 'value' },
				apiUrls: 'nope'
			})
		).toMatchObject({
			allowedBlocks: [],
			customBlocks: ['callout'],
			toolbarExtensions: [],
			apiUrls: {}
		});
	});

	it('drops empty-string apiUrls entries (backward-compat fallback)', () => {
		const config = normalizeConfig({
			apiUrls: { images: '', imagePreview: '/x/0/preview/', chooserModal: '', extra: 1 }
		});
		expect(config.apiUrls).toEqual({ imagePreview: '/x/0/preview/' });
	});
});

describe('createBlocks', () => {
	it('always instantiates wagtail.image with the configured renditions', () => {
		const registry = createBlocks(
			normalizeConfig({ imageRenditions: ['width-320', 'original'] })
		);

		const image = registry.get('wagtail.image');
		expect(image).toBeDefined();
		const options = (image?.attributes.rendition.options ?? []) as ReadonlyArray<
			string | AttributeOption<string>
		>;
		expect(
			options.map((option) =>
				typeof option === 'object' && option !== null ? option.value : option
			)
		).toEqual(['width-320', 'original']);
	});

	it('instantiates registered custom block factories by key', () => {
		window.uncialWagtail = { customBlocks: { callout: createCalloutBlock } };

		const registry = createBlocks(normalizeConfig({ customBlocks: ['callout'] }));

		expect(registry.has('wagtail.image')).toBe(true);
		expect(registry.has('callout')).toBe(true);
		expect(registry.get('callout')?.label).toBe('Callout');
	});

	it('warns and skips unknown custom block keys', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		window.uncialWagtail = { customBlocks: { callout: createCalloutBlock } };

		const registry = createBlocks(
			normalizeConfig({ customBlocks: ['missing', 'callout'] })
		);

		expect(registry.has('callout')).toBe(true);
		expect(registry.has('missing')).toBe(false);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('"missing"');
	});

	it('warns and skips factories that duplicate an existing block id', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		window.uncialWagtail = {
			customBlocks: { callout: createCalloutBlock, 'callout-again': createCalloutBlock }
		};

		const registry = createBlocks(
			normalizeConfig({ customBlocks: ['callout', 'callout-again'] })
		);

		expect(registry.blocks.filter((block) => block.id === 'callout')).toHaveLength(1);
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it('works without any registry on window', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const registry = createBlocks(normalizeConfig({ customBlocks: ['callout'] }));

		expect(registry.blocks.map((block) => block.id)).toEqual(['wagtail.image']);
		expect(warn).toHaveBeenCalledTimes(1);
	});
});

describe('resolveToolbarExtensions', () => {
	const feature = { id: 'demo', label: 'Demo', run: () => {} };

	it('resolves registered keys to toolbar features', () => {
		window.uncialWagtail = { toolbarExtensions: { demo: feature } };
		expect(resolveToolbarExtensions(['demo'])).toEqual([feature]);
	});

	it('warns and skips unknown keys', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		window.uncialWagtail = { toolbarExtensions: { demo: feature } };

		expect(resolveToolbarExtensions(['demo', 'missing'])).toEqual([feature]);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('"missing"');
	});

	it('returns nothing without a registry', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(resolveToolbarExtensions(['demo'])).toEqual([]);
		expect(warn).toHaveBeenCalledTimes(1);
	});
});
