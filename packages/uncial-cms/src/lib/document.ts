import { normalizeDocument, validateDocument } from 'uncial/core';
import type { BlockDefinition, BlockRegistry, ContentDocument, ContentSchema } from 'uncial/core';

export type Blocks = BlockRegistry | BlockDefinition[];

/** Load boundary: raw forge file content → normalized Uncial document. */
export function parseDocument(raw: string, blocks: Blocks, schema: ContentSchema): ContentDocument {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error('The document file is not valid JSON.');
	}
	return normalizeDocument(parsed as Partial<ContentDocument>, blocks, schema);
}

/** Save boundary: validate, normalize, and serialize the document for commit. */
export function serializeDocument(
	document: ContentDocument,
	blocks: Blocks,
	schema: ContentSchema
): string {
	const result = validateDocument(document, blocks, schema);
	const errors = result.issues.filter((issue) => issue.severity === 'error');
	if (errors.length > 0) {
		throw new Error(
			`The document failed validation and was not saved: ${errors
				.map((issue) => issue.message)
				.join('; ')}`
		);
	}
	return `${JSON.stringify(normalizeDocument(document, blocks, schema), null, '\t')}\n`;
}
