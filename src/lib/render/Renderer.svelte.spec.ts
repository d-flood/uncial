import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Renderer from './Renderer.svelte';

describe('Renderer', () => {
	it('renders plain html from tiptap json', async () => {
		render(Renderer, {
			content: {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{ type: 'text', text: 'Hello ' },
							{ type: 'text', text: 'world', marks: [{ type: 'bold' }] }
						]
					}
				]
			}
		});

		const strong = page.getByText('world');
		await expect.element(strong).toBeInTheDocument();
	});
});
