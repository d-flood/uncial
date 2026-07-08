import { describe, expect, it } from 'vitest';
import { hashForPagePath, pagePathFromHash, validatePagePath } from './paths.js';

describe('validatePagePath', () => {
	it.each([
		['about', 'about'],
		['team/new-page', 'team/new-page'],
		['blog/2026/a-1', 'blog/2026/a-1'],
		['/about/', 'about'], // leading/trailing slashes are stripped, not stored
		['  team/new-page ', 'team/new-page']
	])('accepts %j as %j', (input, path) => {
		expect(validatePagePath(input)).toEqual({ ok: true, path });
	});

	it.each([
		[''],
		['/'],
		['About'],
		['team page'],
		['team_page'],
		['a//b'],
		['a/./b'],
		['../secret'],
		['about.json'],
		['ümlaut']
	])('rejects %j with a message', (input) => {
		const result = validatePagePath(input);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toMatch(/[a-z]/);
	});
});

describe('hash routing', () => {
	it('round-trips path ↔ hash', () => {
		for (const [path, hash] of [
			['about', '#/about/'],
			['team/new-page', '#/team/new-page/'],
			['', '#/']
		] as const) {
			expect(hashForPagePath(path)).toBe(hash);
			expect(pagePathFromHash(hash)).toBe(path);
		}
	});

	it('returns null for the list view (no hash)', () => {
		expect(pagePathFromHash('')).toBeNull();
		expect(pagePathFromHash('#')).toBeNull();
	});

	it('tolerates a missing trailing slash', () => {
		expect(pagePathFromHash('#/about')).toBe('about');
	});
});
