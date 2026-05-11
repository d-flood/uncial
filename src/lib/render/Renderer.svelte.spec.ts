import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { Editor as TiptapEditor } from '@tiptap/core';
import Renderer from './Renderer.svelte';
import RichText from './RichText.svelte';
import ContainerBlockFixture from './ContainerBlockFixture.svelte';
import { createBlockRegistry, defineBlock } from '../core/index.js';
import { createEditorExtensions } from '../shared/tiptap.js';

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

	it('escapes literal script tags in rich text', async () => {
		const rendered = render(Renderer, {
			content: {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [{ type: 'text', text: '<script>alert(1)</script>' }]
					}
				]
			}
		});

		await expect.element(page.getByText('<script>alert(1)</script>')).toBeInTheDocument();
		expect(rendered.container.querySelector('script')).toBeNull();
	});

	it('escapes dangerous tags in highlighted code blocks', async () => {
		const rendered = render(Renderer, {
			content: {
				type: 'doc',
				content: [
					{
						type: 'codeBlock',
						content: [
							{ type: 'text', text: '<script>alert(1)</script><img src=x onerror=alert(1)>' }
						]
					}
				]
			}
		});

		await expect.element(page.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
		expect(rendered.container.querySelector('script')).toBeNull();
		expect(rendered.container.querySelector('img')).toBeNull();
	});

	it('does not render unsafe link hrefs', async () => {
		const rendered = render(Renderer, {
			content: {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{
								type: 'text',
								text: 'Unsafe link',
								marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]
							}
						]
					}
				]
			}
		});

		await expect.element(page.getByText('Unsafe link')).toBeInTheDocument();
		expect(rendered.container.querySelector('a[href]')).toBeNull();
	});

	it('renders safe link hrefs', async () => {
		const rendered = render(Renderer, {
			content: {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{
								type: 'text',
								text: 'Safe link',
								marks: [{ type: 'link', attrs: { href: ' https://example.com/docs ' } }]
							}
						]
					}
				]
			}
		});

		const link = rendered.container.querySelector('a');
		await expect.element(page.getByText('Safe link')).toBeInTheDocument();
		expect(link?.getAttribute('href')).toBe('https://example.com/docs');
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

describe('Tiptap links', () => {
	it('does not serialize unsafe hrefs from imported html', () => {
		const editor = new TiptapEditor({
			element: document.createElement('div'),
			extensions: createEditorExtensions(),
			content: '<p><a href="javascript:alert(1)">Unsafe link</a></p>'
		});

		expect(JSON.stringify(editor.getJSON())).not.toContain('javascript:');
		editor.destroy();
	});

	it('rejects unsafe hrefs from toggleLink', () => {
		const editor = new TiptapEditor({
			element: document.createElement('div'),
			extensions: createEditorExtensions(),
			content: '<p>Unsafe link</p>'
		});
		editor.commands.selectAll();

		const ok = editor.commands.toggleLink({ href: 'javascript:alert(1)' });

		expect(ok).toBe(false);
		expect(JSON.stringify(editor.getJSON())).not.toContain('javascript:');
		editor.destroy();
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
