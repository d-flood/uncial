import { describe, expect, it, vi } from 'vitest';
import { fitImage, type EncodableImage, type ImageEncoder } from './fit-image.js';

/** A Blob that only has to report a size and hand back that many bytes. */
function sizedBlob(size: number): Blob {
	return {
		size,
		type: 'image/webp',
		arrayBuffer: async () => new ArrayBuffer(size)
	} as Blob;
}

interface Attempt {
	width: number;
	height: number;
	quality: number;
}

/**
 * An encoder whose byte count is decided by the test rather than by a codec, so
 * the descent order is observable.
 */
function fakeEncoder(
	image: EncodableImage,
	sizeFor: (attempt: Attempt) => number
): { encoder: ImageEncoder; attempts: Attempt[] } {
	const attempts: Attempt[] = [];
	const encoder: ImageEncoder = {
		decode: vi.fn(async () => image),
		encode: async (_image, width, height, quality) => {
			const attempt = { width, height, quality: Number(quality.toFixed(2)) };
			attempts.push(attempt);
			return sizedBlob(sizeFor(attempt));
		}
	};
	return { encoder, attempts };
}

/** An input whose reported size is over any limit the tests set. */
const oversize = (bytes: number): Blob & { name?: string } =>
	({
		name: 'photo.png',
		type: 'image/png',
		size: bytes,
		arrayBuffer: async () => new ArrayBuffer(4)
	}) as Blob & { name?: string };

describe('fitImage', () => {
	it('steps quality down to its floor before it reduces the dimensions', async () => {
		// Only a narrower image satisfies the ceiling, so the whole quality ladder
		// is exhausted at the maximum edge first.
		const { encoder, attempts } = fakeEncoder({ width: 3000, height: 2000 }, ({ width }) =>
			width <= 1700 ? 500 : 5_000_000
		);

		const result = await fitImage(oversize(9_000_000), { maxBytes: 1000, encoder });

		expect(attempts).toEqual([
			{ width: 2000, height: 1333, quality: 0.82 },
			{ width: 2000, height: 1333, quality: 0.72 },
			{ width: 2000, height: 1333, quality: 0.62 },
			{ width: 2000, height: 1333, quality: 0.52 },
			{ width: 1700, height: 1133, quality: 0.82 }
		]);
		expect(result).toMatchObject({
			filename: 'photo.webp',
			contentType: 'image/webp',
			width: 1700,
			height: 1133
		});
	});

	it('gives up above the minimum edge when nothing fits', async () => {
		const { encoder, attempts } = fakeEncoder({ width: 3000, height: 2000 }, () => 5_000_000);

		await expect(fitImage(oversize(9_000_000), { maxBytes: 1000, encoder })).rejects.toThrow(
			/could not be reduced/i
		);

		const edges = attempts.map(({ width, height }) => Math.max(width, height));
		expect(Math.min(...edges)).toBe(333); // one step further is under the 320 floor
	});

	it('passes bytes that already fit through untouched', async () => {
		const bytes = new Uint8Array([1, 2, 3, 4, 5]);
		const file = Object.assign(new Blob([bytes], { type: 'image/png' }), {
			name: 'small.png'
		}) as Blob & { name?: string };
		const { encoder, attempts } = fakeEncoder({ width: 100, height: 100 }, () => 1);

		const result = await fitImage(file, { encoder });

		expect(result).toEqual({
			bytes,
			filename: 'small.png',
			contentType: 'image/png',
			width: 100,
			height: 100
		});
		expect(attempts).toEqual([]);
	});
});
