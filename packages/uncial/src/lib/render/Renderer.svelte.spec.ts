import { page, userEvent, type Locator } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { Editor as TiptapEditor, type JSONContent } from '@tiptap/core';
import Renderer from './Renderer.svelte';
import Page from './Page.svelte';
import { normalizeDocument } from '../core/normalize.js';
import type { PMDoc } from '../shared/document.js';
import RichText from './RichText.svelte';
import ContainerBlockFixture from './ContainerBlockFixture.svelte';
import { defineRuntimeBlock } from '../core/defineBlock.js';
import { svelteRuntime } from '../runtime/svelte.js';
import { createEditorExtensions } from '../shared/tiptap.js';
import Editor from '../editor/Editor.svelte';
import EditorBlockFixture from '../shared/EditorBlockFixture.svelte';
import TemplateFixture from '../shared/TemplateFixture.svelte';
import MediaBlockFixture from '../shared/MediaBlockFixture.svelte';
import { createContentModel } from '../model.js';

describe('Renderer', () => {
	const plain = createContentModel({ blocks: [] });

	it('renders plain html from tiptap json', async () => {
		render(Renderer, {
			model: plain,
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

	it('anchors a heading at its persisted slug, not at its text', async () => {
		render(Renderer, {
			model: plain,
			content: {
				type: 'doc',
				content: [
					{
						type: 'heading',
						attrs: { level: 2, slug: 'adding-a-plugin-to-your-viewer' },
						content: [{ type: 'text', text: 'Adding a plugin (renamed)' }]
					}
				]
			}
		});

		const heading = page.getByRole('heading', { level: 2 });
		await expect.element(heading).toHaveAttribute('id', 'adding-a-plugin-to-your-viewer');
	});

	it('renders tables with header and rich-text cells', async () => {
		const rendered = render(Renderer, {
			model: plain,
			content: {
				type: 'doc',
				content: [
					{
						type: 'table',
						content: [
							{
								type: 'tableRow',
								content: [
									{
										type: 'tableHeader',
										content: [
											{
												type: 'paragraph',
												content: [{ type: 'text', text: 'API' }]
											}
										]
									}
								]
							},
							{
								type: 'tableRow',
								content: [
									{
										type: 'tableCell',
										content: [
											{
												type: 'paragraph',
												content: [
													{ type: 'text', text: 'createSchema', marks: [{ type: 'code' }] },
													{ type: 'text', text: ' from ' },
													{
														type: 'text',
														text: 'the core API',
														marks: [{ type: 'link', attrs: { href: 'https://example.com/core' } }]
													}
												]
											}
										]
									}
								]
							}
						]
					}
				]
			}
		});

		const table = rendered.container.querySelector('table');
		expect(table?.querySelector('th')?.textContent).toBe('API');
		expect(table?.querySelector('td code')?.textContent).toBe('createSchema');
		expect(table?.querySelector('td a')?.getAttribute('href')).toBe('https://example.com/core');
	});

	it('renders repeated identical text runs without duplicate-key crashes', async () => {
		const rendered = render(Renderer, {
			model: plain,
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
			model: plain,
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
			model: plain,
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
			model: plain,
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

	it('renders only safe link hrefs, with their allowed attributes and noopener', async () => {
		const link = (text: string, attrs: Record<string, unknown>) => ({
			type: 'text',
			text,
			marks: [{ type: 'link', attrs }]
		});
		const rendered = render(Renderer, {
			model: plain,
			content: {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							link('Unsafe', { href: 'javascript:alert(1)', target: '_blank', rel: 'noopener' }),
							link('Full', {
								href: ' https://example.com/docs ',
								title: 'Example docs',
								class: 'fancy-link',
								target: '_blank',
								rel: 'nofollow',
								onclick: 'alert(1)'
							})
						]
					}
				]
			}
		});

		await expect.element(page.getByText('Unsafe')).toBeInTheDocument();
		const links = rendered.container.querySelectorAll('a');
		expect(links).toHaveLength(1);
		expect(links[0]?.getAttribute('href')).toBe('https://example.com/docs');
		expect(links[0]?.getAttribute('title')).toBe('Example docs');
		expect(links[0]?.getAttribute('class')).toBe('fancy-link');
		expect(links[0]?.getAttribute('target')).toBe('_blank');
		expect(links[0]?.getAttribute('rel')).toBe('nofollow noopener');
		expect(links[0]?.hasAttribute('onclick')).toBe(false);
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

const model = createContentModel({
	base: '/x',
	blocks: [
		defineRuntimeBlock(svelteRuntime, {
			id: 'collapsible',
			label: 'Collapsible',
			attributes: { title: '', cover: { default: '', input: 'image' } },
			component: ContainerBlockFixture,
			content: { kind: 'flow' }
		}),
		defineRuntimeBlock(svelteRuntime, {
			id: 'callout',
			label: 'Callout',
			attributes: { title: '' },
			component: EditorBlockFixture,
			content: { kind: 'flow' }
		})
	],
	templates: {
		'./Article.svelte': { template: { id: 'article', label: 'Article' }, default: TemplateFixture }
	},
	meta: { title: { default: '' } }
});

const parityDocument = {
	type: 'doc',
	meta: { title: 'Guide', template: 'article' },
	content: [
		{ type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text: 'Intro' }] },
		{
			type: 'collapsible',
			attrs: { id: 'c1', title: 'FAQ', cover: '/a.png' },
			content: [
				{ type: 'heading', attrs: { id: 'h1', level: 2, slug: 's' }, content: [] },
				{ type: 'callout', attrs: { id: 'b1', title: 'Child' } }
			]
		}
	]
};

function readContext(container: HTMLElement): Record<string, unknown> {
	return JSON.parse(
		container.querySelector('[data-testid="fixture-context"]')?.textContent ?? '{}'
	);
}

describe('Renderer/editor parity', () => {
	it('gives a Block the same Block context in the Renderer and the Editor', async () => {
		const reader = render(Renderer, { content: parityDocument, model, path: 'guide' });
		const read = readContext(reader.container);
		expect(read).toMatchObject({
			type: 'callout',
			attrs: { title: 'Child' },
			editing: false,
			parent: { type: 'collapsible', attrs: { title: 'FAQ', cover: '/x/a.png' } },
			index: 1,
			siblings: [
				{ type: 'heading', attrs: { level: 2 } },
				{ type: 'callout', attrs: { title: 'Child' } }
			],
			page: { path: 'guide', template: 'article', meta: { title: 'Guide' } }
		});

		const editing = render(Editor, {
			props: { model, json: parityDocument, meta: parityDocument.meta, path: 'guide' },
			context: new Map([['fixture-app', 'theme']])
		});
		await expect.poll(() => readContext(editing.container).editing).toBe(true);
		await expect
			.poll(() => readContext(editing.container))
			.toEqual({ ...read, editing: true, app: 'theme' });
		const page = render(Page, { model, document: parityDocument, path: 'guide' }).container;
		const shell = (container: HTMLElement) => container.querySelector('header')?.textContent;
		expect(shell(page)).toBe(shell(editing.container));

		const editor = (
			editing.container.querySelector('.ProseMirror') as HTMLElement & { editor: TiptapEditor }
		).editor;
		// Inside the container, before the heading: only the child's place changes.
		editor.commands.insertContentAt(8, { type: 'paragraph' });
		await expect.poll(() => readContext(editing.container).index).toBe(2);
		expect(readContext(editing.container).siblings).toHaveLength(3);
	});

	it('commits a Field edit as one normalized, undoable step the reader shows', async () => {
		let json = parityDocument as JSONContent;
		const editing = render(Editor, {
			model,
			json,
			meta: parityDocument.meta,
			onChange: (next: JSONContent) => (json = next)
		});
		const editor = () =>
			(editing.container.querySelector('.ProseMirror') as HTMLElement & { editor: TiptapEditor })
				.editor;
		const blockTitle = () => json.content?.[1]?.content?.[1]?.attrs?.title;
		async function edit(field: Locator, text: string, read: () => unknown) {
			await userEvent.fill(field.getByRole('textbox'), text);
			await userEvent.keyboard('{Enter}');
			await expect.poll(read).toBe(text);
			expect(json).toEqual(
				normalizeDocument(json as PMDoc, model.blocks, model.schemaFor(json.meta))
			);
		}

		await edit(editing.getByTestId('fixture-title'), 'Renamed', blockTitle);
		const read = render(Renderer, { content: json, model }).container;
		expect(read.querySelector('[data-testid="fixture-title"]')?.textContent).toBe('Renamed');
		editor().commands.undo();
		await expect.poll(blockTitle).toBe('Child');

		await edit(editing.getByTestId('template-shell'), 'Handbook', () => json.meta?.title);
		const reader = render(Page, { model, document: json }).container;
		expect(reader.querySelector('header')?.textContent).toContain('Handbook');
		editor().commands.undo();
		await expect.poll(() => json.meta?.title).toBe('Guide');
	});
});

describe('base path and renditions', () => {
	const mediaModel = createContentModel({
		base: '/x',
		blocks: [
			defineRuntimeBlock(svelteRuntime, {
				id: 'media',
				label: 'Media',
				attributes: {
					image: {
						default: '',
						input: 'image',
						renditions: { widths: [400, 800], crops: { square: { aspect: '1:1', width: 300 } } }
					},
					cover: { default: null, input: 'image' },
					download: { default: null, input: 'file' },
					gallery: { default: [], list: { fields: { image: { default: '', input: 'image' } } } }
				},
				component: MediaBlockFixture
			})
		],
		renditions: (value, spec, crop) => {
			const src = typeof value === 'string' ? value : value.src;
			if (crop) return { src: `/r${src}-${crop}` };
			return { src, srcset: spec.widths!.map((width) => `/r${src},${width} ${width}w`).join(', ') };
		}
	});
	const file = { src: '/a.pdf', name: 'a.pdf', size: 1, type: 'application/pdf' };
	const mediaDocument = {
		type: 'doc',
		content: [
			{
				type: 'media',
				attrs: {
					id: 'm',
					image: '/a.png',
					cover: { src: '/a.png' },
					download: file,
					gallery: [{ image: '/a.png' }, { image: 'https://cdn.example/a.png' }]
				}
			},
			{
				type: 'paragraph',
				content: [{ type: 'text', text: 'Link', marks: [{ type: 'link', attrs: { href: '/p/' } }] }]
			}
		]
	};
	const resolved = {
		image: '/x/a.png',
		cover: { src: '/x/a.png' },
		download: { ...file, src: '/x/a.pdf' },
		gallery: [{ image: '/x/a.png' }, { image: 'https://cdn.example/a.png' }]
	};
	const props = (container: HTMLElement) =>
		JSON.parse(container.querySelector('[data-testid="media-props"]')?.textContent ?? '{}');

	it('hands Blocks and links base-resolved values and stores them base-free', async () => {
		const read = render(Renderer, { content: mediaDocument, model: mediaModel }).container;
		expect(props(read)).toEqual(resolved);
		expect(read.querySelector('a')?.getAttribute('href')).toBe('/x/p/');
		const srcset = read.querySelector('[data-testid="media-srcset"]');
		expect(srcset?.getAttribute('srcset')).toBe('/x/r/a.png,400 400w, /x/r/a.png,800 800w');
		expect(srcset?.getAttribute('sizes')).toBe('50vw');
		expect(read.querySelector('[data-testid="media-crop"]')?.getAttribute('src')).toBe(
			'/x/r/a.png-square'
		);

		let json = mediaDocument as JSONContent;
		const editing = render(Editor, {
			model: mediaModel,
			json,
			onChange: (next: JSONContent) => (json = next)
		}).container;
		await expect.poll(() => props(editing)).toEqual(resolved);
		expect(editing.querySelector('.ProseMirror a')?.getAttribute('href')).toBe('/x/p/');
		const original = editing.querySelector('[data-testid="media-srcset"]');
		expect(original?.getAttribute('src')).toBe('/x/a.png');
		expect(original?.hasAttribute('srcset')).toBe(false);

		await userEvent.click(page.getByTestId('media-update').last());
		await expect.poll(() => json.content?.[0]?.attrs?.image).toBe('/b.png');
	});

	it('draws the alt text an image value stores, and none for a decorative image', () => {
		const altModel = createContentModel({
			blocks: [
				defineRuntimeBlock(svelteRuntime, {
					id: 'media',
					label: 'Media',
					attributes: { image: { default: null, input: 'image' } },
					component: MediaBlockFixture
				})
			]
		});
		const read = render(Renderer, {
			content: {
				type: 'doc',
				content: [{ type: 'media', attrs: { id: 'm', image: { src: '/a.png', alt: 'A school' } } }]
			},
			model: altModel
		}).container;

		expect(read.querySelector('[data-testid="media-srcset"]')?.getAttribute('alt')).toBe(
			'A school'
		);

		const decorative = render(Renderer, {
			content: {
				type: 'doc',
				content: [
					{
						type: 'media',
						attrs: { id: 'm', image: { src: '/a.png', alt: 'A school', decorative: true } }
					}
				]
			},
			model: altModel
		}).container;
		expect(decorative.querySelector('[data-testid="media-srcset"]')?.getAttribute('alt')).toBe('');
	});
});
