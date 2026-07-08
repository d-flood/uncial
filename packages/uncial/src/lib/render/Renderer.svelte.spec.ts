import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { Editor as TiptapEditor } from '@tiptap/core';
import Renderer from './Renderer.svelte';
import RichText from './RichText.svelte';
import ContainerBlockFixture from './ContainerBlockFixture.svelte';
import { createBlockRegistry } from '../core/index.js';
import { defineSvelteBlock } from '../runtime/svelte.js';
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

	it('renders repeated identical text runs without duplicate-key crashes', async () => {
		const rendered = render(Renderer, {
			content: {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{ type: 'text', text: 'hi ' },
							{ type: 'text', text: 'x', marks: [{ type: 'bold' }] },
							{ type: 'text', text: 'hi ' }
						]
					}
				]
			}
		});

		const paragraph = rendered.container.querySelector('p');
		expect(paragraph?.textContent).toBe('hi xhi ');
		expect(rendered.container.querySelector('strong')?.textContent).toBe('x');
	});

	it('renders sibling nodes of the same type with identical attrs.id without key crashes', async () => {
		const rendered = render(Renderer, {
			content: {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						attrs: { id: 'dup' },
						content: [{ type: 'text', text: 'First copy' }]
					},
					{
						type: 'paragraph',
						attrs: { id: 'dup' },
						content: [{ type: 'text', text: 'Second copy' }]
					}
				]
			}
		});

		await expect.element(page.getByText('First copy')).toBeInTheDocument();
		await expect.element(page.getByText('Second copy')).toBeInTheDocument();
		expect(rendered.container.querySelectorAll('p')).toHaveLength(2);
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

	it('renders link title, class, target, and rel attributes', async () => {
		const rendered = render(Renderer, {
			content: {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{
								type: 'text',
								text: 'Full link',
								marks: [
									{
										type: 'link',
										attrs: {
											href: 'https://example.com/docs',
											title: 'Example docs',
											class: 'fancy-link',
											target: '_blank',
											rel: 'nofollow',
											onclick: 'alert(1)'
										}
									}
								]
							}
						]
					}
				]
			}
		});

		const link = rendered.container.querySelector('a');
		await expect.element(page.getByText('Full link')).toBeInTheDocument();
		expect(link?.getAttribute('href')).toBe('https://example.com/docs');
		expect(link?.getAttribute('title')).toBe('Example docs');
		expect(link?.getAttribute('class')).toBe('fancy-link');
		expect(link?.getAttribute('target')).toBe('_blank');
		// stored rel is merged with noopener, not clobbered
		expect(link?.getAttribute('rel')?.split(/\s+/)).toEqual(
			expect.arrayContaining(['nofollow', 'noopener'])
		);
		// arbitrary attrs are never rendered
		expect(link?.hasAttribute('onclick')).toBe(false);
	});

	it('adds noopener to target=_blank links without a stored rel', async () => {
		const rendered = render(Renderer, {
			content: {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{
								type: 'text',
								text: 'New tab link',
								marks: [
									{
										type: 'link',
										attrs: { href: 'https://example.com', target: '_blank' }
									}
								]
							}
						]
					}
				]
			}
		});

		const link = rendered.container.querySelector('a');
		await expect.element(page.getByText('New tab link')).toBeInTheDocument();
		expect(link?.getAttribute('target')).toBe('_blank');
		expect(link?.getAttribute('rel')?.split(/\s+/)).toContain('noopener');
	});

	it('does not render unsafe link hrefs even when target and rel are present', async () => {
		const rendered = render(Renderer, {
			content: {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{
								type: 'text',
								text: 'Hostile link',
								marks: [
									{
										type: 'link',
										attrs: {
											href: 'javascript:alert(1)',
											title: 'Nope',
											target: '_blank',
											rel: 'noopener'
										}
									}
								]
							}
						]
					}
				]
			}
		});

		await expect.element(page.getByText('Hostile link')).toBeInTheDocument();
		expect(rendered.container.querySelector('a')).toBeNull();
	});

	it('renders child content inside container blocks', async () => {
		const collapsible = defineSvelteBlock({
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
