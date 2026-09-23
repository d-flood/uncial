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
	register(src: string, file: Blob): void;
	revokeAll(): void;
}

export function createImagePreviews(): ImagePreviews {
	const previews = new Map<string, string>();

	return {
		get: (src) => previews.get(src),
		register(src, file) {
			const previous = previews.get(src);
			if (previous) URL.revokeObjectURL(previous);
			previews.set(src, URL.createObjectURL(file));
		},
		revokeAll() {
			previews.forEach((url) => URL.revokeObjectURL(url));
			previews.clear();
		}
	};
}

function substituteValue(
	spec: AttributeSpec<unknown>,
	value: unknown,
	previews: ImagePreviews
): unknown {
	const kind = inferAttributeInputKind(spec);
	if (kind === 'image') {
		return typeof value === 'string' ? (previews.get(value) ?? value) : value;
	}
	if (kind !== 'list' || !spec.list || !Array.isArray(value)) return value;

	const valueSpec = attributeListValueSpec(spec.list);
	if (valueSpec) return value.map((item) => substituteValue(valueSpec, item, previews));

	const fields = attributeListFields(spec.list);
	return value.map((item) => {
		if (typeof item !== 'object' || item === null) return item;
		const record = item as Record<string, unknown>;
		return Object.fromEntries(
			Object.entries(record).map(([name, fieldValue]) => {
				const fieldSpec = fields.find(([fieldName]) => fieldName === name)?.[1];
				return [name, fieldSpec ? substituteValue(fieldSpec, fieldValue, previews) : fieldValue];
			})
		);
	});
}

/** The attrs a Block component renders on the canvas, with previews in place of image values. */
export function withImagePreviews(
	block: BlockDefinition,
	attrs: Record<string, unknown>,
	previews: ImagePreviews
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(attrs).map(([name, value]) => {
			const spec = block.attributes[name] as AttributeSpec<unknown> | undefined;
			return [name, spec ? substituteValue(spec, value, previews) : value];
		})
	);
}
