import type { PMDoc, PMMark, PMNode } from '../shared/document.js';
import type { BlockDefinition, ContentSchema } from './types.js';
import { createSchema, resolveRegistry } from './registry.js';
import { normalizeBlockAttributes } from './attributes.js';
import { normalizeMeta } from './meta.js';
import { CURRENT_DOCUMENT_VERSION, runDocumentMigrations } from './migrations.js';
import { isPlainObject } from '../shared/guards.js';

export { CURRENT_DOCUMENT_VERSION } from './migrations.js';

function hasStringType(value: unknown): value is { type: string } {
	return isPlainObject(value) && typeof value.type === 'string';
}

function normalizeMarks(marks: unknown, schema?: ContentSchema): PMMark[] | undefined {
	if (!Array.isArray(marks)) return undefined;

	const normalized: PMMark[] = [];

	for (const mark of marks as unknown[]) {
		if (!hasStringType(mark)) continue;
		if (schema && !schema.allowedMarks.has(mark.type)) continue;

		const candidate = mark as PMMark;
		if (candidate.attrs !== undefined && !isPlainObject(candidate.attrs)) {
			const { attrs: _attrs, ...rest } = candidate;
			void _attrs;
			normalized.push(rest);
			continue;
		}

		normalized.push(candidate);
	}

	return normalized.length ? normalized : undefined;
}

function normalizeContent(
	content: unknown,
	registryBlocks: ReadonlyMap<string, BlockDefinition>,
	schema?: ContentSchema
): PMNode[] | undefined {
	if (!Array.isArray(content)) return undefined;

	const normalized: PMNode[] = [];

	for (const child of content as unknown[]) {
		const node = normalizeNode(child, registryBlocks, schema);
		if (node) normalized.push(node);
	}

	return normalized;
}

function normalizeNode(
	node: unknown,
	registryBlocks: ReadonlyMap<string, BlockDefinition>,
	schema?: ContentSchema
): PMNode | undefined {
	if (!hasStringType(node)) {
		return undefined;
	}

	const candidate = node as PMNode;

	// ProseMirror rejects text nodes whose `text` is missing or non-string
	// ("Invalid text node in JSON") and empty-string text nodes ("Empty text
	// nodes are not allowed"); either error makes Tiptap silently replace the
	// entire document with empty content, so drop such nodes here.
	if (
		candidate.type === 'text' &&
		(typeof candidate.text !== 'string' || candidate.text.length === 0)
	) {
		return undefined;
	}

	const attrs = isPlainObject(candidate.attrs) ? candidate.attrs : undefined;
	const marks = normalizeMarks(candidate.marks, schema);
	const content = normalizeContent(candidate.content, registryBlocks, schema);

	const block = registryBlocks.get(candidate.type);
	if (block) {
		return {
			type: candidate.type,
			attrs: normalizeBlockAttributes(block, attrs ?? {}),
			marks,
			content: block.content ? content : undefined
		};
	}

	return {
		...candidate,
		attrs,
		marks,
		content
	};
}

const NO_REGISTRY_BLOCKS = new Map<string, BlockDefinition>();

/**
 * Sanitizes the structural shape of a raw document (object nodes with string
 * types, valid text nodes, array content/marks, object attrs — no schema or
 * block-attribute normalization) and runs the registered migrations on the
 * result, so migration callbacks never receive hostile shapes. A throwing
 * migration never propagates: on throw the sanitized-but-unmigrated document
 * is returned so normalization can proceed.
 *
 * Exported for tests; hosts run migrations via `normalizeDocument`.
 */
export function migrateDocument(
	source: Partial<PMDoc>,
	fromVersion: number,
	toVersion?: number
): PMDoc {
	const sanitized: PMDoc = {
		type: 'doc',
		content: normalizeContent(source.content, NO_REGISTRY_BLOCKS) ?? []
	};
	if (isPlainObject(source.meta)) {
		sanitized.meta = source.meta;
	}

	try {
		return runDocumentMigrations(sanitized, fromVersion, toVersion);
	} catch {
		return sanitized;
	}
}

export function normalizeDocument(
	document: Partial<PMDoc> | null | undefined,
	blocks: Parameters<typeof resolveRegistry>[0],
	schema?: ContentSchema
): PMDoc {
	const registry = resolveRegistry(blocks);
	const registryBlocks = registry.byId;
	// When the host passes no schema, fall back to the registry's default
	// schema (default allowed-mark set) so arbitrary mark types are still
	// filtered out — unknown marks crash ProseMirror's nodeFromJSON, which
	// makes Tiptap replace the whole document with empty content.
	const effectiveSchema = schema ?? createSchema(registry);

	const source: Partial<PMDoc> = isPlainObject(document) ? document : {};
	const rawVersion = source.version;
	// Only treat the stored version as meaningful when it is a positive safe
	// integer; hostile or bogus values (negative, zero, fractional, NaN,
	// Infinity, beyond MAX_SAFE_INTEGER) are handled like a missing version.
	// This also keeps attacker-supplied versions from producing huge
	// migration ranges.
	const sourceVersion =
		typeof rawVersion === 'number' && Number.isSafeInteger(rawVersion) && rawVersion >= 1
			? rawVersion
			: 1;

	let working: Partial<PMDoc> = source;
	if (sourceVersion < CURRENT_DOCUMENT_VERSION) {
		working = migrateDocument(source, sourceVersion);
	}

	const metaFields = effectiveSchema.metaFields;
	const normalized: PMDoc = {
		type: 'doc',
		// Never silently downgrade documents from a newer version; hosts are
		// notified via validateDocument's UNSUPPORTED_VERSION issue.
		version: sourceVersion > CURRENT_DOCUMENT_VERSION ? sourceVersion : CURRENT_DOCUMENT_VERSION,
		content: normalizeContent(working.content, registryBlocks, effectiveSchema) ?? []
	};

	if (metaFields.size > 0) {
		normalized.meta = normalizeMeta(working.meta, metaFields);
	}

	return normalized;
}
