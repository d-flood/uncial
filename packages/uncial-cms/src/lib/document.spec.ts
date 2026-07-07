import { describe, expect, it } from 'vitest';
import { createBlockRegistry, createSchema, CURRENT_DOCUMENT_VERSION } from 'uncial/core';
import { parseDocument, serializeDocument } from './document.js';

const registry = createBlockRegistry([]);
const schema = createSchema(registry);

describe('parseDocument', () => {
	it('parses raw JSON and normalizes it into a versioned document', () => {
		const raw = JSON.stringify({
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }]
		});

		const document = parseDocument(raw, registry, schema);

		expect(document.type).toBe('doc');
		expect(document.version).toBe(CURRENT_DOCUMENT_VERSION);
		expect(document.content).toEqual([
			{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }
		]);
	});

	it('rejects content that is not JSON', () => {
		expect(() => parseDocument('not json', registry, schema)).toThrow(/not valid JSON/i);
	});
});

describe('serializeDocument', () => {
	it('round-trips a parsed document through normalize on save', () => {
		const raw = JSON.stringify({
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }]
		});
		const document = parseDocument(raw, registry, schema);

		const serialized = serializeDocument(document, registry, schema);

		expect(JSON.parse(serialized)).toEqual(document);
		expect(serialized.endsWith('\n')).toBe(true);
	});

	it('rejects a document that fails validation', () => {
		const invalid = {
			type: 'doc' as const,
			version: CURRENT_DOCUMENT_VERSION,
			content: [
				{
					type: 'paragraph',
					content: [{ type: 'text', text: 'Hi', marks: [{ type: 'sparkle' }] }]
				}
			]
		};

		expect(() => serializeDocument(invalid, registry, schema)).toThrow(/sparkle/);
	});
});
