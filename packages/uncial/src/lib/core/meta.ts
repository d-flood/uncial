import type { PMPath } from '../shared/document.js';
import {
	coerceAttributeValue,
	serializeAttributeValue,
	toAttributeDraftValue
} from './attributes.js';
import type {
	AttributeSpec,
	ValidateDocumentOptions,
	ValidationIssue
} from './types.js';
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

	for (const [name, spec] of metaFields) {
		const value = source[name];
		const missing = value === undefined || value === null || value === '';

		if (missing && spec.required) {
			pushIssue(issues, options, {
				code: 'INVALID_META',
				path: [...path, name],
				message: `Required metadata field "${name}" is missing`,
				severity: 'error'
			});
			continue;
		}

		if (missing) continue;

		if (spec.validate && !spec.validate(value)) {
			pushIssue(issues, options, {
				code: 'INVALID_META',
				path: [...path, name],
				message: `Metadata field "${name}" is invalid`,
				severity: 'error',
				details: { value }
			});
		}
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
