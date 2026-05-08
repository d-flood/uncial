import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Renderer from './Renderer.svelte';
import RichText from './RichText.svelte';
import ContainerBlockFixture from './ContainerBlockFixture.svelte';
import { createBlockRegistry, defineBlock } from '../core/index.js';

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

	it('renders child content inside container blocks', async () => {
		const collapsible = defineBlock({
			id: 'collapsible',
			label: 'Collapsible',
			attributes: {
				title: ''
			},
			component: ContainerBlockFixture,
			content: { kind: 'flow' }
		});

		const rendered = render(Renderer, {
			content: {
				type: 'doc',
				content: [
					{
						type: 'collapsible',
						attrs: { title: 'FAQ' },
						content: [
							{
								type: 'paragraph',
								content: [{ type: 'text', text: 'Nested copy' }]
							}
						]
					}
				]
			},
			blocks: createBlockRegistry([collapsible])
		});

		await expect.element(page.getByTestId('container-block')).toBeInTheDocument();
		await expect.element(page.getByText('FAQ')).toBeInTheDocument();
		await expect.element(page.getByText('Nested copy')).toBeInTheDocument();
		await expect.element(page.getByTestId('child-count')).toHaveTextContent('1');
		// Children are rendered directly — no internal wrapper div should exist
		expect(rendered.container.querySelector('.uncial-render-children')).toBeNull();
	});
});

describe('RichText', () => {
	it('renders rich text marks and lists structurally', async () => {
		render(RichText, {
			content: {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{ type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
							{ type: 'text', text: ' italic', marks: [{ type: 'italic' }] }
						]
					},
					{
						type: 'bulletList',
						content: [
							{
								type: 'listItem',
								content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item' }] }]
							}
						]
					}
				]
			},
			features: ['bold', 'italic', 'bulletList']
		});

		await expect.element(page.getByText('Bold')).toBeInTheDocument();
		await expect.element(page.getByText('italic')).toBeInTheDocument();
		await expect.element(page.getByText('Item')).toBeInTheDocument();
	});

	it('filters disabled rich text features', async () => {
		render(RichText, {
			content: {
				type: 'doc',
				content: [{ type: 'heading', content: [{ type: 'text', text: 'Hidden heading' }] }]
			},
			features: ['bold']
		});

		await expect.element(page.getByText('Hidden heading')).not.toBeInTheDocument();
	});
});
