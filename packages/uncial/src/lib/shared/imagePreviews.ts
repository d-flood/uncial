import { mapMediaValues, withBase, withoutBase, type MediaSpecs } from './mediaValues.js';

/**
 * Local `blob:` previews of images uploaded this session, keyed by the value
 * the image source returned. An uploaded file is not served until the site
 * redeploys, so the canvas shows the preview in the meantime.
 */
export interface ImagePreviews {
	get(src: string): string | undefined;
	/** The value a preview URL stands in for. */
	sourceOf(url: string): string | undefined;
	register(src: string, file: Blob): void;
	revokeAll(): void;
}

const MISSING_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><rect width="320" height="200" fill="#f4f4f5" stroke="#d4d4d8" stroke-dasharray="6 4"/><text x="160" y="106" font-family="system-ui, sans-serif" font-size="16" fill="#71717a" text-anchor="middle">Missing image</text></svg>`;

/** Unique per value, so {@link ImagePreviews.sourceOf} can map a placeholder back. */
export function missingImagePlaceholder(src: string): string {
	return `data:image/svg+xml,${encodeURIComponent(MISSING_IMAGE_SVG)}#${encodeURIComponent(src)}`;
}

/** `placeholder` answers a stand-in URL for a value with no preview, e.g. a missing image. */
export function createImagePreviews(
	placeholder: (src: string) => string | undefined = () => undefined
): ImagePreviews {
	const previews = new Map<string, string>();
	const sources = new Map<string, string>();

	return {
		get(src) {
			const known = previews.get(src);
			if (known) return known;
			const url = placeholder(src);
			if (url) {
				previews.set(src, url);
				sources.set(url, src);
			}
			return url;
		},
		sourceOf: (url) => sources.get(url),
		register(src, file) {
			// A re-upload answers the same src, so nothing re-renders and the canvas
			// and field keep the earlier URL; it is not revoked until teardown.
			const url = URL.createObjectURL(file);
			sources.set(url, src);
			previews.set(src, url);
		},
		revokeAll() {
			sources.forEach((_src, url) => {
				if (url.startsWith('blob:')) URL.revokeObjectURL(url);
			});
			sources.clear();
			previews.clear();
		}
	};
}

const IMAGES: ReadonlySet<string> = new Set(['image']);

/** The values the canvas renders: previews in place of images, and media URLs under `base`. */
export function toDisplayValues(
	specs: MediaSpecs,
	values: Record<string, unknown>,
	previews: ImagePreviews | undefined,
	base: string
): Record<string, unknown> {
	const previewed = previews
		? mapMediaValues(specs, values, (src) => previews.get(src), IMAGES)
		: values;
	return withBase(specs, previewed, base);
}

/** The values to store from displayed ones, so neither a preview nor the base is ever stored. */
export function toStoredValues(
	specs: MediaSpecs,
	values: Record<string, unknown>,
	previews: ImagePreviews | undefined,
	base: string
): Record<string, unknown> {
	const stored = withoutBase(specs, values, base);
	return previews ? mapMediaValues(specs, stored, (src) => previews.sourceOf(src), IMAGES) : stored;
}
