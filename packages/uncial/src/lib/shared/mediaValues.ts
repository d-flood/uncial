import {
	attributeListFields,
	attributeListValueSpec,
	inferAttributeInputKind
} from '../core/attributes.js';
import type { AttributeSpec } from '../core/types.js';
import { resolveImageSrc, stripBase } from '../render/resolveImageSrc.js';

/** Answers a replacement for a media URL, or undefined to keep it. */
export type MediaLookup = (src: string) => string | undefined;

export type MediaSpecs =
	Record<string, AttributeSpec<unknown>> | ReadonlyMap<string, AttributeSpec<unknown>>;

const MEDIA_KINDS: ReadonlySet<string> = new Set(['image', 'file']);

function mapValue(
	spec: AttributeSpec<unknown>,
	value: unknown,
	lookup: MediaLookup,
	kinds: ReadonlySet<string>
): unknown {
	const kind = inferAttributeInputKind(spec);
	if (kinds.has(kind)) {
		if (typeof value === 'string') return lookup(value) ?? value;
		const src = (value as { src?: unknown } | null)?.src;
		return typeof src === 'string' ? { ...(value as object), src: lookup(src) ?? src } : value;
	}
	if (kind !== 'list' || !spec.list || !Array.isArray(value)) return value;

	const valueSpec = attributeListValueSpec(spec.list);
	if (valueSpec) return value.map((item) => mapValue(valueSpec, item, lookup, kinds));

	const fields = new Map(attributeListFields(spec.list));
	return value.map((item) =>
		typeof item === 'object' && item !== null
			? mapMediaValues(fields, item as Record<string, unknown>, lookup, kinds)
			: item
	);
}

/** `values` with every image and file URL (or only `kinds`) passed through `lookup`, lists included. */
export function mapMediaValues(
	specs: MediaSpecs,
	values: Record<string, unknown>,
	lookup: MediaLookup,
	kinds = MEDIA_KINDS
): Record<string, unknown> {
	const specOf = (name: string) =>
		specs instanceof Map
			? specs.get(name)
			: (specs as Record<string, AttributeSpec<unknown>>)[name];
	return Object.fromEntries(
		Object.entries(values).map(([name, value]) => {
			const spec = specOf(name);
			return [name, spec ? mapValue(spec, value, lookup, kinds) : value];
		})
	);
}

/** The displayed form of stored values: root-relative media URLs under `base`. */
export function withBase(
	specs: MediaSpecs,
	values: Record<string, unknown>,
	base: string
): Record<string, unknown> {
	return base ? mapMediaValues(specs, values, (src) => resolveImageSrc(src, base)) : values;
}

/** The stored form of displayed values. */
export function withoutBase(
	specs: MediaSpecs,
	values: Record<string, unknown>,
	base: string
): Record<string, unknown> {
	return base ? mapMediaValues(specs, values, (src) => stripBase(src, base)) : values;
}
