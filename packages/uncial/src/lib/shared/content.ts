import type { JSONContent } from '@tiptap/core';
import { normalizeMeta } from '../core/meta.js';
import { CURRENT_DOCUMENT_VERSION } from '../core/migrations.js';
import type { AttributeSpec } from '../core/types.js';

export function emptyDocument(
	metaFields: ReadonlyMap<string, AttributeSpec<unknown>> = new Map()
): JSONContent {
	const document: JSONContent = {
		type: 'doc',
		version: CURRENT_DOCUMENT_VERSION,
		content: [{ type: 'paragraph' }]
	};

	if (metaFields.size > 0) {
		(document as JSONContent & { meta?: Record<string, unknown> }).meta = normalizeMeta({}, metaFields);
	}

	return document;
}
