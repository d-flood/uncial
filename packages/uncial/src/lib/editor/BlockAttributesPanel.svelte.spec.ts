import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { Editor as TiptapEditor } from '@tiptap/core';
import { createBlockRegistry, createSchema } from '../core/registry.js';
import type { BlockDefinition } from '../core/types.js';
import { defineRuntimeBlock } from '../core/defineBlock.js';
import { svelteRuntime } from '../runtime/svelte.js';
import EditorBlockFixture from '../shared/EditorBlockFixture.svelte';
import BlockAttributesPanel from './BlockAttributesPanel.svelte';
import { attachEditor } from './bindEditor.js';
import {
	createAttributesController,
	createInitialState,
	type BlockAttributesController,
	type BlockAttributesState
} from './attributesController.js';

const generatedBlock = defineRuntimeBlock(svelteRuntime, {
	id: 'generatedTable',
	label: 'Generated table',
	readOnly: true,
	attributes: { rows: { default: '', input: 'textarea' } },
	component: EditorBlockFixture
});

function editingGeneratedBlockState(): BlockAttributesState {
	return {
		...createInitialState(),
		open: true,
		mode: 'edit',
		selectedBlockId: 'generatedTable',
		draftAttrs: { rows: 'A | B\n' }
	};
}

// A minimal controller stub: the panel only needs `subscribe` to receive the state.
function stubController(state: BlockAttributesState): BlockAttributesController {
	return {
		subscribe(listener: (next: BlockAttributesState) => void) {
			listener(state);
			return () => {};
		}
	} as unknown as BlockAttributesController;
}

describe('BlockAttributesPanel read-only block', () => {
	it('offers no attribute controls for a read-only block', () => {
		const panel = render(BlockAttributesPanel, {
			controller: stubController(editingGeneratedBlockState()),
			blocks: [generatedBlock]
		});

		expect(panel.container.querySelectorAll('input, textarea, select')).toHaveLength(0);
		expect(panel.container.textContent).toContain('Remove Block');
	});
});

// A container block whose one attribute is a plain text field, mirroring the
// site's Tabs block `group` attribute that reproduced the write-through defect.
const tabsBlock = defineRuntimeBlock(svelteRuntime, {
	id: 'tabs',
	label: 'Tabs',
	attributes: { group: '' },
	component: EditorBlockFixture,
	content: { kind: 'flow' }
});

// One panel inside a tabs group: the nested block whose own attributes the panel
// has to be able to reach.
const tabBlock = defineRuntimeBlock(svelteRuntime, {
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
	const controller = createAttributesController();
	let editor: TiptapEditor | null = null;
	const action = attachEditor(host, {
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
		if (pos < 0 && node.type.name === blocks[0].id) pos = at;
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

describe('BlockAttributesPanel conditional attributes', () => {
	it('omits a field whose `when` fails and keeps its stored value', async () => {
		const figure = defineRuntimeBlock(svelteRuntime, {
			id: 'figure',
			label: 'Figure',
			attributes: {
				columns: { default: 1, options: [1, 2] },
				caption: { default: '', when: (attrs) => attrs.columns !== 1 }
			},
			component: EditorBlockFixture
		});
		const harness = mountEditorWithPanel(
			{ type: 'doc', content: [{ type: 'figure', attrs: { columns: 1, caption: 'Kept' } }] },
			[figure]
		);
		await expect.element(page.getByLabelText('columns')).toBeVisible();
		await expect.element(page.getByLabelText('caption')).not.toBeInTheDocument();

		await userEvent.selectOptions(page.getByLabelText('columns'), '2');
		await expect.element(page.getByLabelText('caption')).toHaveValue('Kept');
		expect(harness.editor.state.doc.nodeAt(harness.pos)?.attrs.caption).toBe('Kept');
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
		const secondTabPos =
			harness.editor.state.doc.nodeAt(harness.pos)!.child(0).nodeSize + harness.pos + 1;
		await userEvent.type(page.elementLocator(await attributeField()), 'Lit');
		await expect.poll(() => harness.editor.state.doc.nodeAt(secondTabPos)?.attrs.label).toBe('Lit');
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
	const constrainedTabsBlock = defineRuntimeBlock(svelteRuntime, {
		id: 'tabs',
		label: 'Tabs',
		attributes: { group: '' },
		component: EditorBlockFixture,
		content: { kind: 'flow', allowedBlocks: ['tab'] }
	});
	const noteBlock = defineRuntimeBlock(svelteRuntime, {
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
		const harness = mountEditorWithPanel(oneTabDoc, [constrainedTabsBlock, tabBlock, noteBlock]);

		await expect.poll(() => menuLabels()).toEqual(['Tab']);

		harness.cleanup();
	});

	it("opens a menu that is clickable inside the sidebar's scroll box", async () => {
		const harness = mountEditorWithPanel(oneTabDoc, [tabsBlock, tabBlock, noteBlock]);
		// The sidebar's panel is a sticky, capped scroll box, which clips a menu laid
		// out inside it at its own edge.
		const sidebar = document.createElement('div');
		sidebar.className = 'uncial-editor-sidebar';
		document.body.append(sidebar);
		const panel = await vi.waitFor(() => {
			const found = document.querySelector<HTMLElement>('.uncial-attrs-panel');
			if (!found) throw new Error('the panel never rendered');
			return found;
		});
		sidebar.append(panel);
		panel.style.cssText =
			'width: 18rem; max-height: 96px; overflow-y: auto; position: sticky; top: 0;';

		const summary = await vi.waitFor(() => {
			const found = panel.querySelector<HTMLElement>('.uncial-dropdown > summary');
			if (!found) throw new Error('the Add block trigger never rendered');
			return found;
		});
		const details = summary.closest('details');
		if (!details) throw new Error('the trigger is not a dropdown');
		const toggled = new Promise<void>((resolve) => {
			details.addEventListener('toggle', () => resolve(), { once: true });
		});
		summary.click();
		await toggled;
		await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

		const entries = await vi.waitFor(() => {
			const found = Array.from(
				panel.querySelectorAll<HTMLButtonElement>('.uncial-dropdown__menu button')
			);
			if (found.length !== 3) throw new Error('the menu never listed every block');
			return found;
		});
		const unreachable = entries.filter((entry) => {
			const rect = entry.getBoundingClientRect();
			return (
				document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) !== entry
			);
		});
		expect(unreachable).toEqual([]);

		// The entry a click lands on inserts the child it names.
		entries.find((entry) => entry.textContent?.trim() === 'Tab')!.click();
		await expect
			.poll(() => document.querySelectorAll('.uncial-attrs-panel .uncial-child-item').length)
			.toBe(2);

		sidebar.remove();
		harness.cleanup();
	});

	it('offers every registered block for a container that names none', async () => {
		const harness = mountEditorWithPanel(oneTabDoc, [tabsBlock, tabBlock, noteBlock]);

		await expect.poll(() => menuLabels()).toEqual(['Tabs', 'Tab', 'Note']);

		harness.cleanup();
	});
});
