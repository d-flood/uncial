import { describe, expect, it } from 'vitest';
import { getCodeLanguageClass, highlightCodeToHtml } from './syntaxHighlight.js';

describe('getCodeLanguageClass', () => {
	it('builds a language-<lang> class from a trimmed, lower-cased language', () => {
		expect(getCodeLanguageClass('js')).toBe('language-js');
		expect(getCodeLanguageClass('  TS ')).toBe('language-ts');
	});

	it('returns an empty class for empty, blank, or non-string languages', () => {
		expect(getCodeLanguageClass('')).toBe('');
		expect(getCodeLanguageClass('   ')).toBe('');
		expect(getCodeLanguageClass(null)).toBe('');
		expect(getCodeLanguageClass(undefined)).toBe('');
		expect(getCodeLanguageClass(123)).toBe('');
	});
});

describe('highlightCodeToHtml', () => {
	it('wraps highlighted tokens of a known language in span elements', () => {
		const html = highlightCodeToHtml('const x = 1;', 'javascript');
		expect(html).toContain('<span class="');
		expect(html).toContain('const');
	});

	it('escapes every HTML-significant character in code text', () => {
		const html = highlightCodeToHtml(`& < > " '`, 'xml');
		expect(html).toContain('&amp;');
		expect(html).toContain('&lt;');
		expect(html).toContain('&gt;');
		expect(html).toContain('&quot;');
		expect(html).toContain('&#39;');
	});

	it('keeps hostile code inert — script/img markup never survives as live tags', () => {
		const html = highlightCodeToHtml('</script><img src=x onerror="alert(1)">', 'xml');

		// The rendered output is an XSS surface: the only tags it may contain are
		// the highlighter's own <span> wrappers. The hostile markup must appear
		// only as escaped text, never as parseable elements.
		expect(html).not.toMatch(/<img/i);
		expect(html).not.toMatch(/<script/i);
		expect(html).not.toMatch(/<\/script/i);
		expect(html).not.toMatch(/onerror=/i);
		expect(html).toContain('&lt;');
		expect(html).toContain('&gt;');

		// Stripping the highlighter's own spans must leave no angle brackets.
		const withoutSpans = html.replace(/<\/?span[^>]*>/g, '');
		expect(withoutSpans).not.toMatch(/[<>]/);
	});

	it('still escapes hostile text when the language is unknown (auto-highlight path)', () => {
		const html = highlightCodeToHtml('<img onerror="alert(1)">', 'no-such-language');
		expect(html).not.toMatch(/<img/i);
		expect(html).toContain('&lt;');
		expect(html).toContain('&gt;');
	});
});
