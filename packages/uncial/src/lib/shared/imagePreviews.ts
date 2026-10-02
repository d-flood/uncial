import {
	attributeListFields,
	attributeListValueSpec,
	inferAttributeInputKind
} from '../core/attributes.js';
import type { AttributeSpec, BlockDefinition } from '../core/types.js';

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

type Lookup = (value: string) => string | undefined;

function substituteValue(spec: AttributeSpec<unknown>, value: unknown, lookup: Lookup): unknown {
	const kind = inferAttributeInputKind(spec);
	if (kind === 'image') {
		return typeof value === 'string' ? (lookup(value) ?? value) : value;
	}
	if (kind !== 'list' || !spec.list || !Array.isArray(value)) return value;

	const valueSpec = attributeListValueSpec(spec.list);
	if (valueSpec) return value.map((item) => substituteValue(valueSpec, item, lookup));

	const fields = attributeListFields(spec.list);
	return value.map((item) => {
		if (typeof item !== 'object' || item === null) return item;
		const record = item as Record<string, unknown>;
		return Object.fromEntries(
			Object.entries(record).map(([name, fieldValue]) => {
				const fieldSpec = fields.find(([fieldName]) => fieldName === name)?.[1];
				return [name, fieldSpec ? substituteValue(fieldSpec, fieldValue, lookup) : fieldValue];
			})
		);
	});
}

function substituteAttrs(
	block: BlockDefinition,
	attrs: Record<string, unknown>,
	lookup: Lookup
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(attrs).map(([name, value]) => {
			const spec = block.attributes[name] as AttributeSpec<unknown> | undefined;
			return [name, spec ? substituteValue(spec, value, lookup) : value];
		})
	);
}

/** The attrs a Block component renders on the canvas, with previews in place of image values. */
export function withImagePreviews(
	block: BlockDefinition,
	attrs: Record<string, unknown>,
	previews: ImagePreviews
): Record<string, unknown> {
	return substituteAttrs(block, attrs, (value) => previews.get(value));
}

/**
 * The attrs a Block component writes back, with its previews turned into the
 * values they stand in for, so a preview is never stored.
 */
export function withoutImagePreviews(
	block: BlockDefinition,
	attrs: Record<string, unknown>,
	previews: ImagePreviews
): Record<string, unknown> {
	return substituteAttrs(block, attrs, (value) => previews.sourceOf(value));
}
