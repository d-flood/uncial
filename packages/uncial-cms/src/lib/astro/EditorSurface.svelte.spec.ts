import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { createBlockRegistry, createSchema } from 'uncial/core';
import { defineSvelteBlock } from 'uncial/runtime/svelte';
import type { ImageSource } from 'uncial/editor';
import { defineSite } from '../define-site.js';
import EditorSurface from './EditorSurface.svelte';
import Photo from '../../fixtures/Photo.svelte';

const photo = defineSvelteBlock({
	id: 'photo',
	label: 'Photo',
	attributes: { src: { default: '', input: 'image' } },
	component: Photo
});
const blocks = createBlockRegistry([photo]);
const schema = createSchema(blocks, {
	metaFields: { title: { default: 'Untitled page', required: true } }
});

const storedDocument = {
	type: 'doc',
	version: 1,
	meta: { title: 'Photos' },
	content: [{ type: 'photo', attrs: { id: 'photo-1', src: '' } }]
};

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	vi.restoreAllMocks();
});

describe('EditorSurface', () => {
	it('backs input: image fields with the imageSource it is given', async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ content: JSON.stringify(storedDocument), sha: 'sha-1' }), {
					headers: { 'Content-Type': 'application/json' }
				})
		) as unknown as typeof fetch;
		const browse = vi.fn(async () => ['/uploads/a.png']);
		const imageSource: ImageSource = { browse };

		render(EditorSurface, {
			site: defineSite({ contentDir: 'content' }, { dev: true }),
			sourcePath: 'content/photos.json',
			pagePath: 'photos',
			blocks,
			schema,
			imageSource
		});

		await page.getByRole('button', { name: 'Photo', exact: true }).click();
		await page.getByRole('button', { name: 'Choose existing' }).click();
		await expect.poll(() => browse.mock.calls.length).toBe(1);
	});
});
