import type {
	AttributeConfig,
	AttributeInputKind,
	AttributeListSpec,
	AttributeOption,
	AttributeSpec,
	BlockDefinition
} from './types.js';
import { coerceRichTextDocument } from '../shared/richText.js';
import { isPlainObject, isAttributeOption } from '../shared/guards.js';

export type AttributeDefinition = Pick<BlockDefinition, 'attributes'> & { readOnly?: boolean };

/**
 * The keys that mark an object as an {@link AttributeSpec} *configuration*
 * rather than a shorthand object default. An object carrying any of these is a
 * config; to use an object literal AS the default, wrap it explicitly:
 * `{ default: { ... } }`.
 */
const CONFIG_KEYS = [
	'default',
	'required',
	'validate',
	'parse',
	'serialize',
	'input',
	'placeholder',
	'options',
	'list',
	'richText'
] as const;

export function isAttributeSpecConfig<T>(value: AttributeConfig<T>): value is AttributeSpec<T> {
	return isPlainObject(value) && CONFIG_KEYS.some((key) => key in value);
}

export function toAttributeSpec<T>(value: AttributeConfig<T>): AttributeSpec<T> {
	return isAttributeSpecConfig(value)
		? { ...(value as AttributeSpec<T>) }
		: ({ default: value } as AttributeSpec<T>);
}

/**
 * The fields of one list item, as specs. Empty for a list of single values,
 * which {@link attributeListValueSpec} describes instead.
 */
export function attributeListFields(
	list: AttributeListSpec
): Array<[string, AttributeSpec<unknown>]> {
	return Object.entries(list.fields ?? {}).map(([name, config]) => [name, toAttributeSpec(config)]);
}

export function attributeListValueSpec(list: AttributeListSpec): AttributeSpec<unknown> | null {
	return list.fields ? null : list.value === undefined ? null : toAttributeSpec(list.value);
}

/** A new item carrying each declared default, ready to append to a list. */
export function createAttributeListItem(list: AttributeListSpec): unknown {
	const valueSpec = attributeListValueSpec(list);
	if (valueSpec) return cloneDefault(valueSpec.default);

	return Object.fromEntries(
		attributeListFields(list).map(([name, spec]) => [name, cloneDefault(spec.default)])
	);
}

function parseJsonValue(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return undefined;
	}
}

/**
 * Returns a fresh copy of an attribute default before handing it out, so two
 * block instances that both fall back to an object/array default never share one
 * mutable reference (mutating one block's attrs would otherwise leak into every
 * other block using the same spec). Primitive defaults are returned as-is.
 */
function cloneDefault<T>(value: T): T {
	if (value !== null && typeof value === 'object') {
		return structuredClone(value);
	}
	return value;
}

export function normalizeAttributeOptions<T>(
	spec: AttributeSpec<T>
): AttributeOption<T>[] | undefined {
	if (!spec.options || spec.options.length === 0) return undefined;

	return spec.options.map((option): AttributeOption<T> => {
		if (isAttributeOption<T>(option)) {
			return {
				value: option.value,
				label: option.label ?? String(option.value),
				description: option.description
			};
		}

		return {
			value: option as T,
			label: String(option)
		};
	});
}

export function inferAttributeInputKind(spec: AttributeSpec<unknown>): AttributeInputKind {
	if (spec.input) return spec.input;

	if (spec.list) return 'list';
	if (spec.options && spec.options.length > 0) return 'select';
	if (typeof spec.default === 'boolean') return 'checkbox';
	if (typeof spec.default === 'number') return 'number';
	if (Array.isArray(spec.default) || isPlainObject(spec.default)) return 'json';
	if (typeof spec.default === 'string' && spec.default.includes('\n')) return 'textarea';

	return 'text';
}

export function coerceAttributeValue<T>(spec: AttributeSpec<T>, value: unknown): T {
	// Only `undefined`/`null` are "missing" and fall back to the default. An empty
	// string is a real value (e.g. a text attribute cleared by the author), so it
	// must NOT be treated as missing — otherwise string attrs could never be
	// cleared back to "". Each type branch below still rejects "" where it cannot
	// be coerced (number/boolean/array/object) and falls back to the default there.
	//
	// Deliberately NOT run here: `spec.validate`. Dropping a value that fails a
	// semantic validator back to the default would be silent data loss and would
	// defeat the editor's out-of-range-value preservation (the select control's
	// "(current)" option). Semantic validity is reported separately by
	// `validateDocument` (INVALID_ATTR), which is the channel that surfaces it.
	if (value === undefined || value === null) {
		return cloneDefault(spec.default);
	}

	if (spec.parse) {
		const parsed = spec.parse(value);
		return parsed === undefined ? cloneDefault(spec.default) : parsed;
	}

	const fallback = spec.default;
	if (spec.input === 'richtext') {
		return coerceRichTextDocument(value) as T;
	}

	if (typeof fallback === 'string') {
		return String(value) as T;
	}

	if (typeof fallback === 'number') {
		if (typeof value === 'number' && Number.isFinite(value)) return value as T;
		if (typeof value === 'string' && value.trim()) {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) return parsed as T;
		}
		return fallback;
	}

	if (typeof fallback === 'boolean') {
		if (typeof value === 'boolean') return value as T;
		if (typeof value === 'string') {
			const normalized = value.trim().toLowerCase();
			if (['true', '1', 'yes', 'on'].includes(normalized)) return true as T;
			if (['false', '0', 'no', 'off'].includes(normalized)) return false as T;
		}
		return fallback;
	}

	if (Array.isArray(fallback)) {
		if (Array.isArray(value)) return value as T;
		if (typeof value === 'string' && value.trim()) {
			const parsed = parseJsonValue(value);
			if (Array.isArray(parsed)) return parsed as T;
		}
		return cloneDefault(fallback);
	}

	if (isPlainObject(fallback)) {
		if (isPlainObject(value)) return value as T;
		if (typeof value === 'string' && value.trim()) {
			const parsed = parseJsonValue(value);
			if (isPlainObject(parsed)) return parsed as T;
		}
		return cloneDefault(fallback);
	}

	return value as T;
}

export function normalizeBlockAttributes(
	block: AttributeDefinition,
	attrs: Record<string, unknown> = {}
): Record<string, unknown> {
	if (block.readOnly) return attrs;

	return Object.fromEntries(
		Object.entries(block.attributes).map(([name, spec]) => [
			name,
			coerceAttributeValue(spec, attrs[name])
		])
	);
}

export function serializeAttributeValue<T>(spec: AttributeSpec<T>, value: T): unknown {
	if (spec.serialize) {
		return spec.serialize(value);
	}

	return value;
}

export function serializeBlockAttributes(
	block: AttributeDefinition,
	attrs: Record<string, unknown>
): string {
	if (block.readOnly) return JSON.stringify(attrs);

	return JSON.stringify(
		Object.fromEntries(
			Object.entries(block.attributes).map(([name, spec]) => [
				name,
				serializeAttributeValue(spec, coerceAttributeValue(spec, attrs[name]))
			])
		)
	);
}

export function toAttributeDraftValue(spec: AttributeSpec<unknown>, value: unknown): unknown {
	const normalized = coerceAttributeValue(spec, value);
	const input = inferAttributeInputKind(spec);

	if (input === 'checkbox') return Boolean(normalized);
	if (input === 'number') return typeof normalized === 'number' ? normalized : spec.default;
	if (input === 'richtext') return normalized;
	if (input === 'json') return JSON.stringify(normalized, null, 2);
	// A list is edited as the array itself, one control per item.
	if (input === 'list') return Array.isArray(normalized) ? normalized : [];

	return String(normalized ?? '');
}

export function toAttributeDraftValues(
	block: AttributeDefinition,
	attrs: Record<string, unknown>
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(block.attributes).map(([name, spec]) => [
			name,
			toAttributeDraftValue(spec, attrs[name])
		])
	);
}

/**
 * @deprecated Alias of {@link normalizeBlockAttributes}. Parsing draft (form)
 * attribute values back into stored values is exactly attribute normalization:
 * both coerce every declared attribute through `coerceAttributeValue`. Kept as a
 * named export for the editor's attributes controller and existing callers.
 */
export const parseBlockDraftAttributes = normalizeBlockAttributes;
