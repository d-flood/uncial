import { defineSvelteBlock } from 'uncial/runtime/svelte';
import type { BlockAttributes } from 'uncial/core';

import WagtailImage from './WagtailImage.svelte';
import WagtailImageEditor from './WagtailImageEditor.svelte';
import type { UncialReferenceMap } from './references.js';

export interface WagtailImageBlockOptions {
	references?: UncialReferenceMap;
	defaultRendition?: string;
}

export interface WagtailImageBlockAttributes extends BlockAttributes {
	imageId: number | null;
	alt: string;
	rendition: string;
	decorative: boolean;
	previewUrl: string;
}

export function createWagtailImageBlock(options: WagtailImageBlockOptions = {}) {
	const defaultRendition = options.defaultRendition ?? 'width-1200';

	const block = defineSvelteBlock<WagtailImageBlockAttributes>({
		id: 'wagtail.image',
		label: 'Image',
		description: 'A Wagtail image reference resolved through the Uncial sidecar map.',
		attributes: {
			imageId: { default: null, required: true, input: 'wagtail-image' },
			alt: { default: '', input: 'text' },
			rendition: { default: defaultRendition, input: 'text' },
			decorative: { default: false, input: 'checkbox' },
			previewUrl: { default: '', input: 'hidden' }
		},
		components: {
			editor: WagtailImageEditor,
			render: WagtailImage
		},
		html: {
			parseTag: 'figure[data-uncial-wagtail-image]',
			render: (attrs: BlockAttributes) => [
				'figure',
				{ 'data-uncial-wagtail-image': attrs.imageId },
				['img', { alt: attrs.decorative ? '' : attrs.alt }]
			]
		}
	});

	return Object.freeze({ ...block, renderProps: { references: options.references ?? {} } });
}
