import { describe, expect, it } from 'vitest';
import type { AttributeOption } from 'uncial/core';

import { createWagtailImageBlock, DEFAULT_IMAGE_RENDITIONS } from './imageBlock.js';

function optionValues(options: ReadonlyArray<string | AttributeOption<string>> | undefined) {
	return (options ?? []).map((option) =>
		typeof option === 'object' && option !== null ? option.value : option
	);
}

describe('createWagtailImageBlock rendition select', () => {
	it('exposes the default rendition list as select options', () => {
		const block = createWagtailImageBlock();
		const rendition = block.attributes.rendition;

		expect(rendition.input).toBe('select');
		expect(optionValues(rendition.options)).toEqual([...DEFAULT_IMAGE_RENDITIONS]);
		expect(rendition.default).toBe('width-1200');
	});

	it('exposes a custom rendition list as select options', () => {
		const renditions = ['width-320', 'fill-100x100', 'original'];
		const block = createWagtailImageBlock({ renditions });
		const rendition = block.attributes.rendition;

		expect(rendition.input).toBe('select');
		expect(optionValues(rendition.options)).toEqual(renditions);
		expect(rendition.default).toBe('width-320');
	});

	it('keeps the configured default rendition when it is in the list', () => {
		const block = createWagtailImageBlock({
			renditions: ['width-400', 'width-800'],
			defaultRendition: 'width-800'
		});

		expect(block.attributes.rendition.default).toBe('width-800');
	});

	it('falls back to the default list when renditions is empty', () => {
		const block = createWagtailImageBlock({ renditions: [] });

		expect(optionValues(block.attributes.rendition.options)).toEqual([
			...DEFAULT_IMAGE_RENDITIONS
		]);
		expect(block.attributes.rendition.default).toBe('width-1200');
	});
});
