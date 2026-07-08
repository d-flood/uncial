import { describe, expect, it } from 'vitest';
import { resolveLinkRel, sanitizeHref } from './sanitize.js';

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

	it('treats protocol-relative URLs as external, not app-relative', () => {
		// Resolves to https://evil.example — allowed only because the resolved
		// protocol is safe, never via the app-relative fast path.
		expect(sanitizeHref('//evil.example/path')).toBe('//evil.example/path');
		// A protocol-relative URL that cannot resolve to a safe origin is rejected.
		expect(sanitizeHref('//javascript:alert(1)')).toBeNull();
	});
});

describe('resolveLinkRel', () => {
	it('adds noopener for _blank in any case variant', () => {
		expect(resolveLinkRel(undefined, '_blank')).toBe('noopener');
		expect(resolveLinkRel(undefined, '_BLANK')).toBe('noopener');
		expect(resolveLinkRel('nofollow', '_Blank')).toBe('nofollow noopener');
	});

	it('adds noopener for named-window targets', () => {
		expect(resolveLinkRel(undefined, 'evilwin')).toBe('noopener');
	});

	it('leaves same-context targets alone', () => {
		expect(resolveLinkRel(undefined, undefined)).toBeNull();
		expect(resolveLinkRel(undefined, '_self')).toBeNull();
		expect(resolveLinkRel(undefined, '_top')).toBeNull();
		expect(resolveLinkRel('nofollow', '_self')).toBe('nofollow');
	});

	it('does not duplicate an existing noopener', () => {
		expect(resolveLinkRel('noopener', '_blank')).toBe('noopener');
	});
});
