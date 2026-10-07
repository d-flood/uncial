import type { PMPath } from '../shared/document.js';
import {
	attributeListFields,
	attributeListValueSpec,
	coerceAttributeValue,
	serializeAttributeValue,
	toAttributeDraftValue
} from './attributes.js';
import type { AttributeSpec, ValidateDocumentOptions, ValidationIssue } from './types.js';
import { pushIssue } from './issues.js';
import { isPlainObject as isRecord } from '../shared/guards.js';

export function normalizeMeta(
	meta: unknown,
	metaFields: ReadonlyMap<string, AttributeSpec<unknown>>
): Record<string, unknown> {
	const source = isRecord(meta) ? meta : {};
	return Object.fromEntries(
		Array.from(metaFields, ([name, spec]) => [name, coerceAttributeValue(spec, source[name])])
	);
}

export function validateMeta(
	meta: unknown,
	metaFields: ReadonlyMap<string, AttributeSpec<unknown>>,
	issues: ValidationIssue[],
	options?: ValidateDocumentOptions,
	path: PMPath = ['meta']
): void {
	const source = isRecord(meta) ? meta : {};

	if (meta !== undefined && !isRecord(meta)) {
		pushIssue(issues, options, {
			code: 'INVALID_META',
			path,
			message: 'Document metadata must be an object',
			severity: 'error',
			details: { value: meta }
		});
		return;
	}

	for (const name of Object.keys(source)) {
		if (!metaFields.has(name)) {
			pushIssue(issues, options, {
				code: 'UNKNOWN_META',
				path: [...path, name],
				message: `Unknown metadata field "${name}"`,
				severity: 'warning',
				details: { field: name }
			});
		}
	}

	function validateValue(
		spec: AttributeSpec<unknown>,
		value: unknown,
		label: string,
		valuePath: PMPath
	): void {
		if (spec.validate && !spec.validate(value)) {
			pushIssue(issues, options, {
				code: 'INVALID_META',
				path: valuePath,
				message: `Metadata field "${label}" is invalid`,
				severity: 'error',
				details: { value }
			});
		}

		if (!spec.list || !Array.isArray(value)) return;

		const valueSpec = attributeListValueSpec(spec.list);
		const fields = attributeListFields(spec.list);
		value.forEach((item, index) => {
			if (valueSpec) {
				validateValue(valueSpec, item, `${label}.${index}`, [...valuePath, index]);
				return;
			}
			const record = isRecord(item) ? item : {};
			for (const [name, fieldSpec] of fields) {
				validateField(fieldSpec, record[name], `${label}.${index}.${name}`, [
					...valuePath,
					index,
					name
				]);
			}
		});
	}

	function validateField(
		spec: AttributeSpec<unknown>,
		value: unknown,
		label: string,
		fieldPath: PMPath
	): void {
		const missing = value === undefined || value === null || value === '';

		if (missing && spec.required) {
			pushIssue(issues, options, {
				code: 'INVALID_META',
				path: fieldPath,
				message: `Required metadata field "${label}" is missing`,
				severity: 'error'
			});
			return;
		}

		if (!missing) validateValue(spec, value, label, fieldPath);
	}

	for (const [name, spec] of metaFields) {
		validateField(spec, source[name], name, [...path, name]);
	}
}

export function toMetaDraftValues(
	metaFields: ReadonlyMap<string, AttributeSpec<unknown>>,
	meta: Record<string, unknown> = {}
): Record<string, unknown> {
	return Object.fromEntries(
		Array.from(metaFields, ([name, spec]) => [name, toAttributeDraftValue(spec, meta[name])])
	);
}

export function parseMetaDraftValues(
	metaFields: ReadonlyMap<string, AttributeSpec<unknown>>,
	draft: Record<string, unknown>
): Record<string, unknown> {
	return Object.fromEntries(
		Array.from(metaFields, ([name, spec]) => [name, coerceAttributeValue(spec, draft[name])])
	);
}

export function serializeMeta(
	metaFields: ReadonlyMap<string, AttributeSpec<unknown>>,
	meta: Record<string, unknown> = {}
): Record<string, unknown> {
	return Object.fromEntries(
		Array.from(metaFields, ([name, spec]) => [
			name,
			serializeAttributeValue(spec, coerceAttributeValue(spec, meta[name]))
		])
	);
}
