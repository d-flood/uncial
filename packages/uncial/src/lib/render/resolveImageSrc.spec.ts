import { describe, expect, it } from 'vitest';
import { resolveImageSrc } from './resolveImageSrc.js';

describe('resolveImageSrc', () => {
	it('prefixes a root-relative src with the base', () => {
		expect(resolveImageSrc('/media/a.webp', '')).toBe('/media/a.webp');
		expect(resolveImageSrc('/media/a.webp', '/sub')).toBe('/sub/media/a.webp');
	});

	it('does not double the slash when the base has a trailing slash', () => {
		expect(resolveImageSrc('/media/a.webp', '/sub/')).toBe('/sub/media/a.webp');
	});

	it.each([
		'blob:http://localhost:5173/0b4c2d1e-8f3a-4b5c-9d6e-7f8a9b0c1d2e',
		'data:image/png;base64,iVBORw0KGgo=',
		'//cdn.example.com/a.webp',
		'https://example.com/a.webp',
		'media/a.webp',
		''
	])('passes %j through unchanged', (src) => {
		expect(resolveImageSrc(src, '/sub')).toBe(src);
	});
});
