import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeDocument, validateDocument } from 'uncial';
import type { ContentDocument } from 'uncial';
import { site } from '../routes/site.js';

const files = readdirSync(site.localContentDir).filter((name) => name.endsWith('.json'));

describe('Docs content', () => {
	it.each(files)('%s parses, normalizes and validates, with a title and nav group', (name) => {
		const doc = JSON.parse(
			readFileSync(join(site.localContentDir, name), 'utf-8')
		) as ContentDocument;
		const result = validateDocument(
			normalizeDocument(doc, site.blocks, site.schemaFor()),
			site.blocks,
			site.schemaFor()
		);
		expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
		expect(result.ok).toBe(true);
		expect(doc.meta?.title).toBeTruthy();
		expect(doc.meta?.navGroup).toBeTruthy();
	});
});
