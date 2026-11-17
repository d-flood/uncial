import type { FocalPoint, ImageValue, RenditionSpec } from 'uncial/core';

export interface PlannedRendition {
	/** `w<width>` for a srcset width, else the crop's name. */
	key: string;
	/** Relative to the served media directory: `r/<hash>-<key>.<ext>`. */
	file: string;
	width: number;
	/** Width over height, for a crop. */
	aspect?: number;
	focal: FocalPoint;
}

const RASTER = /\.(jpe?g|png|webp|avif)$/i;
const CENTRE: FocalPoint = { x: 0.5, y: 0.5 };

export function imageSrc(image: ImageValue | string | null | undefined): string {
	return typeof image === 'string' ? image : (image?.src ?? '');
}

/** The part of `src` under the served media directory, or null when it lies elsewhere. */
export function mediaPath(src: string, mediaUrlPrefix: string): string | null {
	const prefix = `/${mediaUrlPrefix.replace(/^\/+|\/+$/g, '')}/`;
	const path = src.split(/[?#]/)[0];
	if (!path.startsWith(prefix) || !RASTER.test(path)) return null;
	const rest = path.slice(prefix.length);
	return rest.startsWith('r/') ? null : rest;
}

export function parseAspect(aspect: string): number {
	const [width, height] = aspect.split(':').map(Number);
	if (!(width > 0 && height > 0)) throw new Error(`Invalid rendition aspect "${aspect}"`);
	return width / height;
}

// FNV-1a, twice with different offsets for 64 bits: names need only be stable and spread.
function hash(text: string): string {
	let a = 0x811c9dc5;
	let b = 0x01000193 ^ 0x5bd1e995;
	for (let index = 0; index < text.length; index++) {
		const code = text.charCodeAt(index);
		a = Math.imul(a ^ code, 0x01000193);
		b = Math.imul(b ^ code, 0x01000193);
	}
	return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

export function planRenditions(
	image: ImageValue | string | null | undefined,
	spec: RenditionSpec,
	mediaUrlPrefix: string
): PlannedRendition[] {
	const path = mediaPath(imageSrc(image), mediaUrlPrefix);
	if (path === null) return [];
	const source = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
	// A PNG is usually a photograph saved losslessly; WebP keeps its alpha at a fraction of the size.
	const ext = source === 'png' ? 'webp' : source;
	const focal = (typeof image === 'object' && image?.focal) || CENTRE;
	const name = (key: string, params: string) => `r/${hash(`${path}|${params}`)}-${key}.${ext}`;

	const widths = (spec.widths ?? []).map((width) => ({
		key: `w${width}`,
		file: name(`w${width}`, `w${width}`),
		width,
		focal
	}));
	const crops = Object.entries(spec.crops ?? {}).map(([key, crop]) => {
		const aspect = parseAspect(crop.aspect);
		return {
			key,
			file: name(key, `${crop.aspect}|${crop.width}|${focal.x},${focal.y}`),
			width: crop.width,
			aspect,
			focal
		};
	});
	return [...widths, ...crops];
}
