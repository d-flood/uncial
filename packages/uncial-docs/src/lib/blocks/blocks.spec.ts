import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { normalizeDocument } from 'uncial/core';
import type { ContentDocument } from 'uncial/core';
import { Renderer } from 'uncial/render';
import { blocks, schema } from '../../routes/site.js';

/** SSR the document through uncial's renderer with the docs block registry. */
function renderDoc(content: ContentDocument): string {
	return render(Renderer, { props: { content, blocks, schema } }).body;
}

/** Editor round-trip: normalize → JSON serialize → parse → normalize again. */
function roundTrip(content: ContentDocument): ContentDocument {
	const normalized = normalizeDocument(content, blocks, schema);
	return normalizeDocument(JSON.parse(JSON.stringify(normalized)), blocks, schema);
}

function calloutDoc(variant: string): ContentDocument {
	return {
		type: 'doc',
		content: [
			{
				type: 'callout',
				attrs: { variant },
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body copy here.' }] }]
			}
		]
	} as ContentDocument;
}

describe('Callout block (SSR)', () => {
	it('renders each variant with distinct styling and label', () => {
		const note = renderDoc(calloutDoc('note'));
		expect(note).toContain('data-variant="note"');
		expect(note).toContain('bg-info');
		expect(note).toContain('Note');

		const warning = renderDoc(calloutDoc('warning'));
		expect(warning).toContain('data-variant="warning"');
		expect(warning).toContain('bg-warning');
		expect(warning).toContain('Warning');

		const tip = renderDoc(calloutDoc('tip'));
		expect(tip).toContain('data-variant="tip"');
		expect(tip).toContain('bg-success');
		expect(tip).toContain('Tip');
	});

	it('renders its rich-text body from the flow content region', () => {
		expect(renderDoc(calloutDoc('note'))).toContain('Body copy here.');
	});

	it('falls back to the note variant for an unknown value', () => {
		expect(renderDoc(calloutDoc('bogus'))).toContain('data-variant="note"');
	});

	it('preserves variant and body across an editor round-trip', () => {
		const result = roundTrip(calloutDoc('warning'));
		const block = result.content?.[0];
		expect(block?.attrs).toEqual({ variant: 'warning' });
		expect(block?.content?.[0]?.content?.[0]).toMatchObject({ type: 'text', text: 'Body copy here.' });
	});
});

function imageDoc(attrs: Record<string, unknown>): ContentDocument {
	return { type: 'doc', content: [{ type: 'image', attrs }] } as ContentDocument;
}

describe('Image block (SSR)', () => {
	it('renders a figure with an alt-texted img and a caption', () => {
		const body = renderDoc(
			imageDoc({ src: '/uncial/docs/uploads/abc.png', alt: 'A diagram', caption: 'Figure 1' })
		);
		expect(body).toContain('<figure');
		expect(body).toContain('src="/uncial/docs/uploads/abc.png"');
		expect(body).toContain('alt="A diagram"');
		expect(body).toContain('<figcaption');
		expect(body).toContain('Figure 1');
	});

	it('omits the caption element when no caption is set', () => {
		const body = renderDoc(imageDoc({ src: '/uncial/docs/uploads/abc.png', alt: 'A diagram' }));
		expect(body).not.toContain('<figcaption');
	});

	it('escapes markup in alt and caption', () => {
		const body = renderDoc(
			imageDoc({ src: '/x.png', alt: '<script>alert(1)</script>', caption: '<b>bold</b>' })
		);
		expect(body).not.toContain('<script>alert(1)</script>');
		expect(body).not.toContain('<b>bold</b>');
	});

	it('preserves src, alt, and caption across an editor round-trip', () => {
		const result = roundTrip(
			imageDoc({ src: '/uncial/docs/uploads/abc.png', alt: 'A diagram', caption: 'Figure 1' })
		);
		expect(result.content?.[0]?.attrs).toEqual({
			src: '/uncial/docs/uploads/abc.png',
			alt: 'A diagram',
			caption: 'Figure 1'
		});
	});
});
