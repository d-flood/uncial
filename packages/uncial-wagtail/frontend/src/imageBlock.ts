import { defineSvelteBlock } from 'uncial/runtime/svelte';
import type { BlockAttributes } from 'uncial/core';

import WagtailImage from './WagtailImage.svelte';
import WagtailImageEditor from './WagtailImageEditor.svelte';
import type { UncialReferenceMap } from './references.js';

export const DEFAULT_IMAGE_RENDITIONS = [
	'width-400',
	'width-800',
	'width-1200',
	'fill-600x400',
	'fill-900x600',
	'original'
] as const;

export interface WagtailImageBlockOptions {
	references?: UncialReferenceMap;
	defaultRendition?: string;
	renditions?: string[];
}

export interface WagtailImageBlockAttributes extends BlockAttributes {
	imageId: number | null;
	alt: string;
	rendition: string;
	position: 'left' | 'right' | 'full-width';
	decorative: boolean;
	previewUrl: string;
}

export function createWagtailImageBlock(options: WagtailImageBlockOptions = {}) {
	const renditions = options.renditions?.length
		? options.renditions
		: [...DEFAULT_IMAGE_RENDITIONS];
	const requestedRendition = options.defaultRendition ?? 'width-1200';
	const defaultRendition = renditions.includes(requestedRendition)
		? requestedRendition
		: renditions[0];

	const block = defineSvelteBlock<WagtailImageBlockAttributes>({
		id: 'wagtail.image',
		label: 'Image',
		description: 'A Wagtail image reference resolved through the Uncial sidecar map.',
		attributes: {
			imageId: { default: null, required: true, input: 'wagtail-image' },
			alt: { default: '', input: 'text' },
			rendition: {
				default: defaultRendition,
				input: 'select',
				options: renditions.map((value) => ({ value, label: value }))
			},
			position: {
				default: 'full-width',
				input: 'select',
				options: [
					{ value: 'left', label: 'Left' },
					{ value: 'right', label: 'Right' },
					{ value: 'full-width', label: 'Full width' }
				]
			},
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
				{ 'data-uncial-wagtail-image': attrs.imageId, 'data-position': attrs.position },
				['img', { alt: attrs.decorative ? '' : attrs.alt }]
			]
		}
	});

	return Object.freeze({ ...block, renderProps: { references: options.references ?? {} } });
}
