import { get, writable, type Readable } from 'svelte/store';
import { parseMetaDraftValues, toMetaDraftValues, validateMeta } from '../core/meta.js';
import type { AttributeSpec, ValidationIssue, ValidationResult } from '../core/types.js';

export interface DocumentMetaState {
	draft: Record<string, unknown>;
	errors: Record<string, string>;
	dirty: boolean;
}

export interface DocumentMetaCommitResult {
	meta: Record<string, unknown>;
	validation: ValidationResult;
}

export interface DocumentMetaController extends Readable<DocumentMetaState> {
	getMeta(): Record<string, unknown>;
	setDraft(name: string, value: unknown): void;
	reset(meta?: Record<string, unknown>): void;
	commit(): DocumentMetaCommitResult;
	setMetaFields(fields: ReadonlyMap<string, AttributeSpec<unknown>>): void;
}

const INITIAL_STATE: DocumentMetaState = {
	draft: {},
	errors: {},
	dirty: false
};

function errorsFromIssues(issues: ValidationIssue[]): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const issue of issues) {
		if (issue.severity !== 'error') continue;
		const field = issue.path[0] === 'meta' ? String(issue.path[1] ?? '') : '';
		if (field) errors[field] = issue.message;
	}
	return errors;
}

export function createDocumentMetaController(
	fields: ReadonlyMap<string, AttributeSpec<unknown>> = new Map(),
	meta: Record<string, unknown> = {}
): DocumentMetaController {
	const state = writable<DocumentMetaState>({
		draft: toMetaDraftValues(fields, meta),
		errors: {},
		dirty: false
	});
	let metaFields = fields;
	let currentMeta = parseMetaDraftValues(fields, get(state).draft);

	return {
		subscribe: state.subscribe,
		getMeta() {
			return currentMeta;
		},
		setDraft(name, value) {
			state.update((current) => ({
				...current,
				draft: { ...current.draft, [name]: value },
				errors: { ...current.errors, [name]: '' },
				dirty: true
			}));
		},
		reset(nextMeta = currentMeta) {
			currentMeta = parseMetaDraftValues(metaFields, toMetaDraftValues(metaFields, nextMeta));
			state.set({
				draft: toMetaDraftValues(metaFields, currentMeta),
				errors: {},
				dirty: false
			});
		},
		commit() {
			const nextMeta = parseMetaDraftValues(metaFields, get(state).draft);
			const issues: ValidationIssue[] = [];
			validateMeta(nextMeta, metaFields, issues);
			const validation = {
				ok: !issues.some((issue) => issue.severity === 'error'),
				issues
			};

			if (validation.ok) {
				currentMeta = nextMeta;
			}

			state.update((current) => ({
				...current,
				errors: errorsFromIssues(issues),
				dirty: !validation.ok
			}));

			return { meta: nextMeta, validation };
		},
		setMetaFields(fields) {
			metaFields = fields;
			this.reset(currentMeta);
		}
	};
}
