import { describe, expect, it } from 'vitest';
import { MAX_CONTENT_BYTES } from './constants.js';
import { fitImage } from './fit-image.js';

/**
 * A PNG of pseudo-random pixels: a flat colour would compress well under the
 * limit and never exercise the descent at all.
 */
async function noisePng(width: number, height: number, name: string): Promise<File> {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('no 2d context');
	const image = context.createImageData(width, height);
	// xorshift32: an LCG's low bits are periodic enough for deflate to eat them.
	const next = (seed: number) => {
		let x = seed;
		x ^= x << 13;
		x ^= x >>> 17;
		x ^= x << 5;
		return x >>> 0;
	};
	let seed = 0x2f6e2b1;
	for (let i = 0; i < image.data.length; i += 4) {
		seed = next(seed);
		image.data[i] = seed & 0xff;
		image.data[i + 1] = (seed >>> 8) & 0xff;
		image.data[i + 2] = (seed >>> 16) & 0xff;
		image.data[i + 3] = 255;
	}
	context.putImageData(image, 0, 0);
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
	if (!blob) throw new Error('canvas produced no PNG');
	return new File([blob], name, { type: 'image/png' });
}

describe('fitImage', () => {
	it('re-encodes an oversize image to WebP under the limit and the edge bound', async () => {
		const file = await noisePng(3000, 2000, 'photo.png');
		expect(file.size).toBeGreaterThan(MAX_CONTENT_BYTES);

		const result = await fitImage(file);

		expect(result.contentType).toBe('image/webp');
		expect(result.filename).toMatch(/\.webp$/);
		expect(result.bytes.byteLength).toBeLessThanOrEqual(MAX_CONTENT_BYTES);
		expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(2000);
	});

	it('leaves an image that already fits byte-identical', async () => {
		const file = await noisePng(100, 100, 'thumb.png');
		const original = new Uint8Array(await file.arrayBuffer());

		const result = await fitImage(file);

		expect(result.contentType).toBe('image/png');
		expect(result.filename).toBe('thumb.png');
		expect(result.bytes).toEqual(original);
	});
});
