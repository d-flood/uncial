import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Renderer from './Renderer.svelte';
import SuperscriptMarkFixture from './SuperscriptMarkFixture.svelte';
import { DEFAULT_MARKS, createBlockRegistry, createSchema } from '../core/registry.js';

const blocks = createBlockRegistry([]);
const schema = createSchema(blocks, { allowedMarks: [...DEFAULT_MARKS, 'superscript'] });

// Svelte's SSR output is threaded with hydration comments; the invariant is the
// element nesting, not the markers between them.
function html(body: string): string {
	return body.replace(/<!--[\s\S]*?-->/g, '');
}

function documentWithMarks(marks: { type: string }[]) {
	return {
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: '14', marks }] }]
	};
}

describe('mark renderer registry', () => {
	it('renders a registered custom mark, nested inside the built-in marks', () => {
		const { body } = render(Renderer, {
			props: {
				content: documentWithMarks([{ type: 'bold' }, { type: 'superscript' }]),
				blocks,
				schema,
				marks: [{ id: 'superscript', component: SuperscriptMarkFixture }]
			}
		});

		expect(html(body)).toContain('<strong><sup>14</sup></strong>');
	});

	it('degrades an unregistered mark to bare text', () => {
		const { body } = render(Renderer, {
			props: {
				content: documentWithMarks([{ type: 'superscript' }]),
				blocks,
				schema
			}
		});

		expect(html(body)).not.toContain('<sup>');
		expect(html(body)).toContain('<p>14</p>');
	});
});
