import { describe, expect, it } from 'vitest';
import { buildDocsToc, slugify } from './toc.js';

const heading = (level: number, text: string) => ({
	type: 'heading',
	attrs: { level },
	content: [{ type: 'text', text }]
});

describe('slugify', () => {
	it('lowercases, trims, and hyphenates non-alphanumerics', () => {
		expect(slugify('  Getting Started! ')).toBe('getting-started');
	});

	it('collapses runs of separators and strips leading/trailing hyphens', () => {
		expect(slugify('Add Uncial to a Svelte 5 app')).toBe('add-uncial-to-a-svelte-5-app');
	});
});

describe('buildDocsToc', () => {
	it('derives an entry per heading with id, text, and level', () => {
		const toc = buildDocsToc({
			content: [
				heading(2, 'Your presentation layer is the editor'),
				{ type: 'paragraph', content: [{ type: 'text', text: 'ignored' }] },
				heading(3, 'Add Uncial to a Svelte 5 app')
			]
		});

		expect(toc).toEqual([
			{ id: 'your-presentation-layer-is-the-editor', text: 'Your presentation layer is the editor', level: 2 },
			{ id: 'add-uncial-to-a-svelte-5-app', text: 'Add Uncial to a Svelte 5 app', level: 3 }
		]);
	});

	it('concatenates mixed inline text (e.g. code marks) into the heading text', () => {
		const toc = buildDocsToc({
			content: [
				{
					type: 'heading',
					attrs: { level: 2 },
					content: [
						{ type: 'text', text: 'Use ' },
						{ type: 'text', text: 'defineSvelteBlock', marks: [{ type: 'code' }] },
						{ type: 'text', text: ' once' }
					]
				}
			]
		});

		expect(toc).toEqual([{ id: 'use-definesvelteblock-once', text: 'Use defineSvelteBlock once', level: 2 }]);
	});

	it('disambiguates duplicate slugs with a numeric suffix in document order', () => {
		const toc = buildDocsToc({
			content: [heading(2, 'Setup'), heading(2, 'Setup'), heading(2, 'Setup')]
		});

		expect(toc.map((e) => e.id)).toEqual(['setup', 'setup-2', 'setup-3']);
	});

	it('skips empty headings and ignores non-heading nodes', () => {
		const toc = buildDocsToc({
			content: [
				{ type: 'heading', attrs: { level: 2 }, content: [] },
				{ type: 'paragraph', content: [{ type: 'text', text: 'body' }] },
				heading(2, 'Real')
			]
		});

		expect(toc).toEqual([{ id: 'real', text: 'Real', level: 2 }]);
	});

	it('clamps levels to 1..6 and defaults a missing level to 1', () => {
		const toc = buildDocsToc({
			content: [
				{ type: 'heading', content: [{ type: 'text', text: 'No level' }] },
				{ type: 'heading', attrs: { level: 99 }, content: [{ type: 'text', text: 'Too deep' }] }
			]
		});

		expect(toc.map((e) => e.level)).toEqual([1, 6]);
	});

	it('falls back to a stable id when a heading has no sluggable characters', () => {
		const toc = buildDocsToc({ content: [heading(2, '—'), heading(2, '!!!')] });

		expect(toc.map((e) => e.id)).toEqual(['section', 'section-2']);
	});

	it('returns an empty array for a missing or empty document', () => {
		expect(buildDocsToc(undefined)).toEqual([]);
		expect(buildDocsToc({ content: [] })).toEqual([]);
	});
});
