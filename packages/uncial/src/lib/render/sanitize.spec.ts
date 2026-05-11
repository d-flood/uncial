import { describe, expect, it } from 'vitest';
import { sanitizeHref } from './sanitize.js';

describe('sanitizeHref', () => {
	it('allows safe absolute and relative links', () => {
		expect(sanitizeHref('https://example.com')).toBe('https://example.com');
		expect(sanitizeHref('HTTP://example.com')).toBe('HTTP://example.com');
		expect(sanitizeHref('mailto:hello@example.com')).toBe('mailto:hello@example.com');
		expect(sanitizeHref('tel:+15551234567')).toBe('tel:+15551234567');
		expect(sanitizeHref('/docs/getting-started')).toBe('/docs/getting-started');
		expect(sanitizeHref('#intro')).toBe('#intro');
	});

	it('trims safe links', () => {
		expect(sanitizeHref('  https://example.com  ')).toBe('https://example.com');
		expect(sanitizeHref('\n/docs/getting-started\t')).toBe('/docs/getting-started');
	});

	it('rejects unsafe protocols', () => {
		expect(sanitizeHref('javascript:alert(1)')).toBeNull();
		expect(sanitizeHref('JaVaScRiPt:alert(1)')).toBeNull();
		expect(sanitizeHref(' java\nscript:alert(1)')).toBeNull();
		expect(sanitizeHref('vbscript:msgbox(1)')).toBeNull();
		expect(sanitizeHref('data:text/html;base64,abc')).toBeNull();
	});

	it('rejects empty and non-string values', () => {
		expect(sanitizeHref('')).toBeNull();
		expect(sanitizeHref('   ')).toBeNull();
		expect(sanitizeHref(null)).toBeNull();
		expect(sanitizeHref(undefined)).toBeNull();
		expect(sanitizeHref(123)).toBeNull();
	});
});
