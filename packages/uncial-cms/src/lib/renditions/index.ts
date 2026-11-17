/**
 * Reader-side URLs for the renditions `./build.js` writes. It
 * imports nothing from the editor, so a reader page can use it.
 */
import type { ImageValue, RenditionSpec } from 'uncial';
import { imageSrc, planRenditions } from './plan.js';

export interface RenditionOptions {
	/** Where the site serves `mediaDir`, e.g. `/media`. */
	mediaUrlPrefix: string;
	/** A crop named in the spec; without one, the spec's widths. */
	crop?: string;
}

export interface Rendition {
	src: string;
	srcset?: string;
}

/**
 * `src` and `srcset` for an image value under a spec. An image outside the
 * served media directory, or not a raster, comes back as its own `src`. Like
 * a stored `src`, the result carries no base path.
 */
export function rendition(
	image: ImageValue | string | null | undefined,
	spec: RenditionSpec,
	opts: RenditionOptions
): Rendition | null {
	const src = imageSrc(image);
	if (!src) return null;
	const planned = planRenditions(image, spec, opts.mediaUrlPrefix);
	if (planned.length === 0) return { src };

	const prefix = `/${opts.mediaUrlPrefix.replace(/^\/+|\/+$/g, '')}/`;
	const url = (file: string) => `${prefix}${file}`;
	if (opts.crop) {
		const crop = planned.find((item) => item.aspect !== undefined && item.key === opts.crop);
		return crop ? { src: url(crop.file) } : { src };
	}

	const widths = planned.filter((item) => item.aspect === undefined);
	if (widths.length === 0) return { src };
	return {
		src: url(widths.at(-1)!.file),
		srcset: widths.map((item) => `${url(item.file)} ${item.width}w`).join(', ')
	};
}
