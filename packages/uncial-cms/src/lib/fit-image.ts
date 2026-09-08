/**
 * Re-encode an oversize image so it fits a size-capped forge. The Contents API
 * refuses anything over ~1 MB, which a photograph off a phone always is, so the
 * editor's upload path re-encodes to WebP within a bounded longest edge and
 * steps quality — then dimensions — down until the bytes fit.
 */
import { MAX_CONTENT_BYTES } from './constants.js';
import type { UploadAssetFile } from './index-actions.js';

export interface EncodableImage {
	width: number;
	height: number;
	close?: () => void;
}

/** Decode/encode seam, injected so the descent is testable without a canvas. */
export interface ImageEncoder {
	decode: (file: Blob) => Promise<EncodableImage>;
	encode: (image: EncodableImage, width: number, height: number, quality: number) => Promise<Blob>;
}

export interface FitOptions {
	/** Byte ceiling the result must come under; defaults to the Contents API cap. */
	maxBytes?: number;
	/** Longest-edge ceiling for the re-encoded image. */
	maxEdge?: number;
}

export interface FittedImage extends UploadAssetFile {
	width: number;
	height: number;
}

const DEFAULT_MAX_EDGE = 2000;
const INITIAL_QUALITY = 0.82;
const MIN_QUALITY = 0.5;
const QUALITY_STEP = 0.1;
const SIZE_STEP = 0.85;
const MIN_EDGE = 320;

const browserEncoder: ImageEncoder = {
	decode: (file) => createImageBitmap(file),
	encode: async (image, width, height, quality) => {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('This browser cannot prepare images for upload.');
		context.drawImage(image as CanvasImageSource, 0, 0, width, height);
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/webp', quality)
		);
		if (!blob || blob.type !== 'image/webp') {
			throw new Error('This browser cannot encode WebP images for upload.');
		}
		return blob;
	}
};

function dimensionsWithin(width: number, height: number, longestEdge: number): [number, number] {
	const sourceEdge = Math.max(width, height);
	if (sourceEdge <= longestEdge) return [width, height];
	const scale = longestEdge / sourceEdge;
	return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

/**
 * Prepare `file` for upload under `maxBytes`. Bytes that already fit inside
 * both ceilings pass through untouched, keeping their original filename and
 * content type; anything else comes back as WebP named `<stem>.webp`.
 */
export async function fitImage(
	file: Blob & { name?: string },
	opts: FitOptions & { encoder?: ImageEncoder } = {}
): Promise<FittedImage> {
	const maxBytes = opts.maxBytes ?? MAX_CONTENT_BYTES;
	const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE;
	const encoder = opts.encoder ?? browserEncoder;
	const filename = file.name || 'image';
	const image = await encoder.decode(file);

	try {
		if (file.size <= maxBytes && Math.max(image.width, image.height) <= maxEdge) {
			return {
				bytes: new Uint8Array(await file.arrayBuffer()),
				filename,
				contentType: file.type || 'application/octet-stream',
				width: image.width,
				height: image.height
			};
		}

		let [width, height] = dimensionsWithin(image.width, image.height, maxEdge);
		let quality = INITIAL_QUALITY;
		while (true) {
			const blob = await encoder.encode(image, width, height, quality);
			if (blob.size <= maxBytes) {
				const stem = filename.replace(/\.[^.]*$/, '') || 'image';
				return {
					bytes: new Uint8Array(await blob.arrayBuffer()),
					filename: `${stem}.webp`,
					contentType: 'image/webp',
					width,
					height
				};
			}
			if (quality - QUALITY_STEP >= MIN_QUALITY) {
				quality -= QUALITY_STEP;
				continue;
			}
			const nextEdge = Math.floor(Math.max(width, height) * SIZE_STEP);
			if (nextEdge < MIN_EDGE) break;
			[width, height] = dimensionsWithin(width, height, nextEdge);
			quality = INITIAL_QUALITY;
		}
	} finally {
		image.close?.();
	}

	throw new Error(
		`Image "${filename}" could not be reduced below the ${maxBytes}-byte upload limit.`
	);
}
