import { describe, expect, it } from 'vitest';
import { sanitizeHref } from './sanitize.js';

describe('sanitizeHref', () => {
	it('allows safe absolute and relative links', () => {
		expect(sanitizeHref('https://example.com')).toBe('https://example.com');
		expect(sanitizeHref('/docs/getting-started')).toBe('/docs/getting-started');
		expect(sanitizeHref('#intro')).toBe('#intro');
	});

	it('rejects unsafe protocols', () => {
		expect(sanitizeHref('javascript:alert(1)')).toBeNull();
		expect(sanitizeHref('data:text/html;base64,abc')).toBeNull();
	});
});
