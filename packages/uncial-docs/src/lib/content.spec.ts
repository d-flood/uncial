import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeDocument, validateDocument } from 'uncial/core';
import type { ContentDocument } from 'uncial/core';
import { blocks, localContentDir, schema } from '../routes/site.js';

/**
 * Guards the ticket-05 content port: every committed Docs document must parse,
 * normalize, and validate against the docs schema/registry (built-in blocks plus
 * the Callout/Image custom blocks), and must carry the title/navGroup/navOrder
 * meta the sidebar (buildDocsNav) is built from. Vitest runs from the package
 * root, so localContentDir ('content/docs') resolves directly.
 */
function contentFiles(): string[] {
	return readdirSync(localContentDir)
		.filter((name) => name.endsWith('.json'))
		.sort();
}

function loadDoc(name: string): ContentDocument {
	return JSON.parse(readFileSync(join(localContentDir, name), 'utf-8')) as ContentDocument;
}

describe('ported Docs content', () => {
	const files = contentFiles();

	it('ships the ported Docs pages (not just the ticket-01 seed)', () => {
		expect(files).toEqual(['blocks.json', 'getting-started.json', 'integrations.json', 'rendering.json']);
	});

	it.each(files)('%s validates against the docs schema with no errors', (name) => {
		const doc = loadDoc(name);
		const normalized = normalizeDocument(doc, blocks, schema);
		const result = validateDocument(normalized, blocks, schema);
		const errors = result.issues.filter((issue) => issue.severity === 'error');
		expect(errors).toEqual([]);
		expect(result.ok).toBe(true);
	});

	it.each(files)('%s carries title/navGroup/navOrder meta for the sidebar', (name) => {
		const meta = loadDoc(name).meta ?? {};
		expect(typeof meta.title).toBe('string');
		expect((meta.title as string).length).toBeGreaterThan(0);
		expect(typeof meta.navGroup).toBe('string');
		expect((meta.navGroup as string).length).toBeGreaterThan(0);
		expect(typeof meta.navOrder).toBe('number');
	});

	it('covers every section from the retired single-page docs', () => {
		const corpus = files
			.map((name) => JSON.stringify(loadDoc(name)))
			.join('\n')
			.toLowerCase();
		// One distinctive phrase per old `tocItems` section, so a dropped topic fails.
		const sectionMarkers = [
			'your presentation layer is the editor', // why
			'add uncial to a svelte 5 app', // install
			'define a custom block once', // blocks
			'create the registry, schema, and controller', // setup
			'edit and render the same json', // usage
			'edit document-level metadata', // metadata
			'match uncial to your site', // theming
			'describe editable block data', // attributes
			'svelte ships first, core stays neutral', // runtime-plugins
			'allow nested document flow', // containers
			'normalize and validate before publish', // validation
			'render on the server without the editor', // ssr
			'use uncial from react, vue, or vanilla js', // web-components
			'store uncial documents in wagtail pages', // wagtail
			'render known blocks, validate user content' // security
		];
		for (const marker of sectionMarkers) {
			expect(corpus, `missing section marker: ${marker}`).toContain(marker);
		}
	});

	it('uses the Callout and Image custom blocks somewhere in the ported content', () => {
		const corpus = files.map((name) => JSON.stringify(loadDoc(name))).join('\n');
		expect(corpus).toContain('"type":"callout"');
		expect(corpus).toContain('"type":"image"');
	});
});
