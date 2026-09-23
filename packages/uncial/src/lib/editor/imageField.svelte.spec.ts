import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { JSONContent } from '@tiptap/core';
import { defineSvelteBlock } from '../runtime/svelte.js';
import ImageBlockFixture from '../shared/ImageBlockFixture.svelte';
import Editor from './Editor.svelte';
import { createBlockAttributesController } from './attributesController.js';
import type { ImageSource } from './imageSource.js';

const imageBlock = defineSvelteBlock({
	id: 'photo',
	label: 'Photo',
	attributes: { src: { default: '', input: 'image' } },
	component: ImageBlockFixture
});

const galleryBlock = defineSvelteBlock({
	id: 'gallery',
	label: 'Gallery',
	attributes: {
		items: {
			default: [{ image: '', caption: '' }],
			list: { fields: { image: { default: '', input: 'image' }, caption: '' }, itemLabel: 'slide' }
		}
	},
	component: ImageBlockFixture
});

function documentWith(type: string, attrs: Record<string, unknown>): JSONContent {
	return { type: 'doc', content: [{ type, attrs: { id: `${type}-1`, ...attrs } }] };
}

function mountEditor(blockType: 'photo' | 'gallery', imageSource: ImageSource) {
	const controller = createBlockAttributesController();
	const changes: JSONContent[] = [];
	const initial =
		blockType === 'photo'
			? documentWith('photo', { src: '' })
			: documentWith('gallery', { items: [{ image: '', caption: '' }] });
	const rendered = render(Editor, {
		blocks: [imageBlock, galleryBlock],
		json: initial,
		attributesController: controller,
		imageSource,
		onChange: (next: JSONContent) => changes.push(next)
	});
	controller.openAttributesAt(0);

	const lastAttrs = () => (changes.at(-1)?.content?.[0]?.attrs ?? {}) as Record<string, unknown>;
	return { rendered, lastAttrs };
}

async function fileInput(container: HTMLElement): Promise<HTMLInputElement> {
	await expect
		.poll(() => container.querySelector('.uncial-editor-sidebar input[type="file"]'))
		.not.toBeNull();
	return container.querySelector<HTMLInputElement>('.uncial-editor-sidebar input[type="file"]')!;
}

function pick(input: HTMLInputElement, file: File): void {
	const transfer = new DataTransfer();
	transfer.items.add(file);
	input.files = transfer.files;
	input.dispatchEvent(new Event('change', { bubbles: true }));
}

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'x.png', { type: 'image/png' });

describe('image attribute field in the editor', () => {
	it('stores the uploaded image source and shows its blob: preview on the canvas', async () => {
		const source: ImageSource = { upload: async () => '/uploads/x.png' };
		const { rendered, lastAttrs } = mountEditor('photo', source);

		pick(await fileInput(rendered.container), png());

		await expect.poll(() => lastAttrs().src).toBe('/uploads/x.png');
		await expect
			.poll(
				() =>
					rendered.container
						.querySelector<HTMLImageElement>('[data-testid="canvas-image"]')
						?.getAttribute('src') ?? ''
			)
			.toMatch(/^blob:/);
	});

	it('uploads an image inside a list item and previews it on the canvas', async () => {
		const source: ImageSource = { upload: async () => '/uploads/slide.png' };
		const { rendered, lastAttrs } = mountEditor('gallery', source);

		pick(await fileInput(rendered.container), png());

		await expect
			.poll(() => (lastAttrs().items as Array<{ image: string }> | undefined)?.[0]?.image)
			.toBe('/uploads/slide.png');
		await expect
			.poll(
				() =>
					rendered.container
						.querySelector<HTMLImageElement>('[data-testid="canvas-gallery-image"]')
						?.getAttribute('src') ?? ''
			)
			.toMatch(/^blob:/);
	});

	it('leaves the image attribute unchanged and shows the error when upload rejects', async () => {
		const source: ImageSource = {
			upload: async () => {
				throw new Error('Forge refused the file');
			}
		};
		const { rendered, lastAttrs } = mountEditor('photo', source);

		pick(await fileInput(rendered.container), png());

		await expect
			.poll(() => rendered.container.querySelector('[role="alert"]')?.textContent)
			.toBe('Forge refused the file');
		expect(lastAttrs().src ?? '').toBe('');
		expect(rendered.container.querySelector('[data-testid="canvas-image"]')).toBeNull();
	});
});
