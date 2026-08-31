import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { Editor as TiptapEditor } from '@tiptap/core';
import { createBlockRegistry, createSchema } from '../core/registry.js';
import type { BlockDefinition } from '../core/types.js';
import { defineSvelteBlock } from '../runtime/svelte.js';
import EditorBlockFixture from '../shared/EditorBlockFixture.svelte';
import BlockAttributesPanel from './BlockAttributesPanel.svelte';
import { bindEditor } from './bindEditor.js';
import {
	createBlockAttributesController,
	createInitialState,
	type BlockAttributesController,
	type BlockAttributesState
} from './attributesController.js';
import { CHOOSE_ATTRIBUTE_EVENT, type ChooseAttributeRequest } from './chooseAttribute.js';

const imageBlock = defineSvelteBlock({
	id: 'image',
	label: 'Image',
	attributes: { imageId: { default: 0, input: 'wagtail-image' } },
	component: EditorBlockFixture
});

const generatedBlock = defineSvelteBlock({
	id: 'generatedTable',
	label: 'Generated table',
	readOnly: true,
	attributes: { rows: { default: '', input: 'textarea' } },
	component: EditorBlockFixture
});

function editingImageState(): BlockAttributesState {
	return {
		...createInitialState(),
		open: true,
		mode: 'edit',
		selectedBlockId: 'image',
		draftAttrs: { imageId: 0 }
	};
}

function editingGeneratedBlockState(): BlockAttributesState {
	return {
		...createInitialState(),
		open: true,
		mode: 'edit',
		selectedBlockId: 'generatedTable',
		draftAttrs: { rows: 'A | B\n' }
	};
}

// A minimal controller stub: the panel only needs `subscribe` (to receive the
// state) for the choose-attribute paths under test.
function stubController(state: BlockAttributesState): BlockAttributesController {
	return {
		subscribe(listener: (next: BlockAttributesState) => void) {
			listener(state);
			return () => {};
		}
	} as unknown as BlockAttributesController;
}

function chooseButton(container: HTMLElement): HTMLButtonElement {
	const button = container.querySelector<HTMLButtonElement>('.uncial-btn--start');
	if (!button) throw new Error('custom attribute "Choose" button not rendered');
	return button;
}

describe('BlockAttributesPanel choose-attribute channel', () => {
	it('offers no attribute controls for a read-only block', () => {
		const panel = render(BlockAttributesPanel, {
			controller: stubController(editingGeneratedBlockState()),
			blocks: [generatedBlock]
		});

		expect(panel.container.querySelectorAll('input, textarea, select')).toHaveLength(0);
		expect(panel.container.textContent).toContain('Remove Block');
	});

	it('routes a custom attribute request to the panel-scoped callback only', () => {
		const windowSpy = vi.fn();
		window.addEventListener(CHOOSE_ATTRIBUTE_EVENT, windowSpy);
		const eventsA: ChooseAttributeRequest[] = [];
		const eventsB: ChooseAttributeRequest[] = [];

		const panelA = render(BlockAttributesPanel, {
			controller: stubController(editingImageState()),
			blocks: [imageBlock],
			onChooseAttribute: (request) => eventsA.push(request)
		});
		const panelB = render(BlockAttributesPanel, {
			controller: stubController(editingImageState()),
			blocks: [imageBlock],
			onChooseAttribute: (request) => eventsB.push(request)
		});

		// Interacting with editor A must reach only A's callback — no shared
		// window channel, so editor B is untouched (the cross-talk regression).
		chooseButton(panelA.container).click();

		expect(eventsA).toHaveLength(1);
		expect(eventsA[0]?.name).toBe('imageId');
		expect(eventsA[0]?.inputKind).toBe('wagtail-image');
		expect(eventsB).toHaveLength(0);
		expect(windowSpy).not.toHaveBeenCalled();

		window.removeEventListener(CHOOSE_ATTRIBUTE_EVENT, windowSpy);
	});

	it('falls back to the deprecated window event when no callback is supplied', () => {
		const received: ChooseAttributeRequest[] = [];
		const listener = (event: Event) => received.push((event as CustomEvent).detail);
		window.addEventListener(CHOOSE_ATTRIBUTE_EVENT, listener);

		const panel = render(BlockAttributesPanel, {
			controller: stubController(editingImageState()),
			blocks: [imageBlock]
		});
		chooseButton(panel.container).click();

		expect(received).toHaveLength(1);
		expect(received[0]?.name).toBe('imageId');

		window.removeEventListener(CHOOSE_ATTRIBUTE_EVENT, listener);
	});
});

// A container block whose one attribute is a plain text field, mirroring the
// site's Tabs block `group` attribute that reproduced the write-through defect.
const tabsBlock = defineSvelteBlock({
	id: 'tabs',
	label: 'Tabs',
	attributes: { group: '' },
	component: EditorBlockFixture,
	content: { kind: 'flow' }
});

// One panel inside a tabs group: the nested block whose own attributes the panel
// has to be able to reach.
const tabBlock = defineSvelteBlock({
	id: 'tab',
	label: 'Tab',
	attributes: { label: '' },
	component: EditorBlockFixture,
	content: { kind: 'flow' }
});

interface PanelHarness {
	editor: TiptapEditor;
	controller: BlockAttributesController;
	pos: number;
	cleanup(): void;
}

/**
 * Mount a real editor bound to a real controller, with the panel rendered
 * against it, and open the panel on the document's first `tabs` block.
 */
function mountEditorWithPanel(
	json: Record<string, unknown> = {
		type: 'doc',
		content: [
			{
				type: 'tabs',
				attrs: { group: '' },
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tab body' }] }]
			}
		]
	},
	blocks: BlockDefinition[] = [tabsBlock]
): PanelHarness {
	const host = document.createElement('div');
	document.body.append(host);
	const registry = createBlockRegistry(blocks);
	const schema = createSchema(registry);
	const controller = createBlockAttributesController();
	let editor: TiptapEditor | null = null;
	const action = bindEditor(host, {
		blocks: registry,
		schema,
		attributesController: controller,
		json,
		onEditor: (next) => {
			if (next) editor = next;
		}
	});

	const boundEditor = editor as TiptapEditor | null;
	if (!boundEditor) throw new Error('editor was not attached');

	render(BlockAttributesPanel, { controller, blocks });

	let pos = -1;
	boundEditor.state.doc.descendants((node, at) => {
		if (pos < 0 && node.type.name === 'tabs') pos = at;
	});
	controller.openAttributesAt(pos);

	return {
		editor: boundEditor,
		controller,
		pos,
		cleanup() {
			action.destroy?.();
			host.remove();
		}
	};
}

describe('BlockAttributesPanel live attribute write-through', () => {

	it('lands every character typed into a text attribute field', async () => {
		const harness = mountEditorWithPanel();
		const input = await vi.waitFor(() => {
			const found = document.querySelector<HTMLInputElement>(
				'.uncial-attrs-panel .uncial-input--sm'
			);
			if (!found) throw new Error('the group attribute field never rendered');
			return found;
		});
		const selectionBefore = harness.editor.state.selection.toJSON();

		await userEvent.type(page.elementLocator(input), 'abcdef');

		await expect
			.poll(() => harness.editor.state.doc.nodeAt(harness.pos)?.attrs.group)
			.toBe('abcdef');
		// The panel stays open on the same block, and the field keeps its text,
		// its DOM identity and the caret.
		expect(input.value).toBe('abcdef');
		expect(document.querySelector('.uncial-attrs-panel .uncial-input--sm')).toBe(input);
		expect(document.activeElement).toBe(input);
		expect(harness.editor.state.selection.toJSON()).toEqual(selectionBefore);

		harness.cleanup();
	});
});

describe('BlockAttributesPanel nested block selection', () => {
	function nestedTabsHarness(): PanelHarness {
		return mountEditorWithPanel(
			{
				type: 'doc',
				content: [
					{
						type: 'tabs',
						attrs: { group: 'framework' },
						content: [
							{
								type: 'tab',
								attrs: { label: 'Svelte' },
								content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }]
							},
							{
								type: 'tab',
								attrs: { label: '' },
								content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }]
							}
						]
					}
				]
			},
			[tabsBlock, tabBlock]
		);
	}

	function childRows(): HTMLButtonElement[] {
		return Array.from(
			document.querySelectorAll<HTMLButtonElement>(
				'.uncial-attrs-panel .uncial-child-item__content'
			)
		);
	}

	async function attributeField(): Promise<HTMLInputElement> {
		return vi.waitFor(() => {
			const found = document.querySelector<HTMLInputElement>(
				'.uncial-attrs-panel .uncial-input--sm'
			);
			if (!found) throw new Error('the attribute field never rendered');
			return found;
		});
	}

	it('labels the second tab through its nested row, then returns to the container', async () => {
		const harness = nestedTabsHarness();
		const rows = await vi.waitFor(() => {
			const found = childRows();
			if (found.length !== 2) throw new Error('the nested rows never rendered');
			return found;
		});

		rows[1].click();

		await expect
			.poll(() => document.querySelector('.uncial-attrs-panel .uncial-attrs-title')?.textContent)
			.toContain('Tab');
		const secondTabPos = harness.editor.state.doc.nodeAt(harness.pos)!.child(0).nodeSize +
			harness.pos +
			1;
		await userEvent.type(page.elementLocator(await attributeField()), 'Lit');
		await expect
			.poll(() => harness.editor.state.doc.nodeAt(secondTabPos)?.attrs.label)
			.toBe('Lit');
		expect(harness.editor.state.doc.nodeAt(harness.pos)?.attrs.group).toBe('framework');

		// Selecting the container again brings the panel back to it, with the
		// child's new label showing in its row.
		harness.controller.openAttributesAt(harness.pos);
		await expect
			.poll(() => document.querySelector('.uncial-attrs-panel .uncial-attrs-title')?.textContent)
			.toContain('Tabs');
		await expect
			.poll(() => childRows().map((row) => row.textContent?.replace(/\s+/g, ' ').trim()))
			.toEqual(['Tab Svelte', 'Tab Lit']);

		harness.cleanup();
	});
});

describe('BlockAttributesPanel nested block menu', () => {
	const constrainedTabsBlock = defineSvelteBlock({
		id: 'tabs',
		label: 'Tabs',
		attributes: { group: '' },
		component: EditorBlockFixture,
		content: { kind: 'flow', allowedBlocks: ['tab'] }
	});
	const noteBlock = defineSvelteBlock({
		id: 'note',
		label: 'Note',
		attributes: { title: '' },
		component: EditorBlockFixture
	});

	function menuLabels(): string[] {
		return Array.from(
			document.querySelectorAll<HTMLButtonElement>(
				'.uncial-attrs-panel .uncial-dropdown__menu button'
			)
		).map((button) => button.textContent?.trim() ?? '');
	}

	const oneTabDoc = {
		type: 'doc',
		content: [
			{
				type: 'tabs',
				attrs: { group: 'framework' },
				content: [
					{
						type: 'tab',
						attrs: { label: 'Svelte' },
						content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }]
					}
				]
			}
		]
	};

	it('offers only the declared child for a container that names one', async () => {
		const harness = mountEditorWithPanel(oneTabDoc, [
			constrainedTabsBlock,
			tabBlock,
			noteBlock
		]);

		await expect.poll(() => menuLabels()).toEqual(['Tab']);

		harness.cleanup();
	});

	it('offers every registered block for a container that names none', async () => {
		const harness = mountEditorWithPanel(oneTabDoc, [tabsBlock, tabBlock, noteBlock]);

		await expect.poll(() => menuLabels()).toEqual(['Tabs', 'Tab', 'Note']);

		harness.cleanup();
	});
});
