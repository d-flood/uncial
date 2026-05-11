import type {
	AttributeInputKind,
	AttributeOption,
	AttributeSpec,
	BlockDefinition
} from './types.js';
import { coerceRichTextDocument } from '../shared/richText.js';

export type AttributeDefinition = Pick<BlockDefinition, 'attributes'>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonValue(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return undefined;
	}
}

function isAttributeOption<T>(value: unknown): value is AttributeOption<T> {
	return typeof value === 'object' && value !== null && !Array.isArray(value) && 'value' in value;
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

	if (spec.options && spec.options.length > 0) return 'select';
	if (typeof spec.default === 'boolean') return 'checkbox';
	if (typeof spec.default === 'number') return 'number';
	if (Array.isArray(spec.default) || isPlainObject(spec.default)) return 'json';
	if (typeof spec.default === 'string' && spec.default.includes('\n')) return 'textarea';

	return 'text';
}

export function coerceAttributeValue<T>(spec: AttributeSpec<T>, value: unknown): T {
	if (value === undefined || value === null || value === '') {
		return spec.default;
	}

	if (spec.parse) {
		const parsed = spec.parse(value);
		return parsed === undefined ? spec.default : parsed;
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
		return fallback;
	}

	if (isPlainObject(fallback)) {
		if (isPlainObject(value)) return value as T;
		if (typeof value === 'string' && value.trim()) {
			const parsed = parseJsonValue(value);
			if (isPlainObject(parsed)) return parsed as T;
		}
		return fallback;
	}

	return value as T;
}

export function normalizeBlockAttributes(
	block: AttributeDefinition,
	attrs: Record<string, unknown> = {}
): Record<string, unknown> {
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

export function parseBlockDraftAttributes(
	block: AttributeDefinition,
	draftAttrs: Record<string, unknown>
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(block.attributes).map(([name, spec]) => [
			name,
			coerceAttributeValue(spec, draftAttrs[name])
		])
	);
}
