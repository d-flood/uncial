import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { Editor as TiptapEditor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { createEditorExtensions } from '../shared/tiptap.js';
import { createBlockRegistry, createSchema } from '../core/registry.js';
import { defineSvelteBlock } from '../runtime/svelte.js';
import { CODE_BLOCK_ID } from '../shared/codeBlockAttributes.js';
import EditorBlockFixture from '../shared/EditorBlockFixture.svelte';
import { bindEditor } from './bindEditor.js';
import {
	createBlockAttributesController,
	type BlockAttributesState
} from './attributesController.js';

// Characterization tests for the attributes controller (slice 03, step 1).
//
// These pin the CURRENT observable behavior of the controller before any
// refactor. They intentionally exercise the controller directly — driving
// selection changes on a real Tiptap editor and calling `syncFromSelection`
// ourselves — because a raw editor does not wire its selection/update events to
// the controller (bindEditor's onSelectionUpdate/onUpdate do that in production).
//
// Adequacy bar (verified manually via mutation reverts, see slice 03 notes):
// flipping a boolean guard in `syncFromSelection` fails at least one test here.

const containerBlock = defineSvelteBlock({
	id: 'section',
	label: 'Section',
	attributes: { title: '' },
	component: EditorBlockFixture,
	content: { kind: 'flow' }
});

const atomBlock = defineSvelteBlock({
	id: 'note',
	label: 'Note',
	attributes: { title: '' },
	component: EditorBlockFixture
});

// A second, DIFFERENT leaf block so "selection moves between two blocks" tests
// actually cross a block-id boundary, and a block that carries a `required`
// attribute + a `validate`d attribute so draft-validation paths are covered.
const badgeBlock = defineSvelteBlock({
	id: 'badge',
	label: 'Badge',
	attributes: {
		label: { default: '', required: true },
		weight: { default: 1, validate: (value: unknown) => typeof value === 'number' && value <= 3 }
	},
	component: EditorBlockFixture
});

interface Harness {
	host: HTMLElement;
	editor: TiptapEditor;
	controller: ReturnType<typeof createBlockAttributesController>;
	snapshots: BlockAttributesState[];
	cleanup(): void;
}

function createHarness(content: Record<string, unknown>): Harness {
	const host = document.createElement('div');
	document.body.append(host);
	const registry = createBlockRegistry([containerBlock, atomBlock, badgeBlock]);
	const schema = createSchema(registry);
	const editor = new TiptapEditor({
		element: host,
		extensions: createEditorExtensions(registry, schema),
		content
	});
	const controller = createBlockAttributesController();
	controller.attach(editor, registry, schema);

	const snapshots: BlockAttributesState[] = [];
	const unsubscribe = controller.subscribe((state) => snapshots.push(state));

	return {
		host,
		editor,
		controller,
		snapshots,
		cleanup() {
			unsubscribe();
			controller.detach();
			editor.destroy();
			host.remove();
		}
	};
}

/** Position immediately before the first node of the given type (or -1). */
function posOf(editor: TiptapEditor, typeName: string): number {
	let found = -1;
	editor.state.doc.descendants((node, pos) => {
		if (found < 0 && node.type.name === typeName) found = pos;
	});
	return found;
}

function selectNode(editor: TiptapEditor, pos: number): void {
	editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
}

function paragraphDoc(text = 'Hello world'): Record<string, unknown> {
	return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

describe('attributesController — attach/detach/subscribe lifecycle', () => {
	it('publishes allowed block ids on attach and resets state on detach', () => {
		const harness = createHarness(paragraphDoc());

		// subscribe fires synchronously with the post-attach snapshot.
		expect(harness.snapshots.length).toBeGreaterThan(0);
		const attached = get(harness.controller);
		expect(attached.allowedBlockIds).toEqual(['section', 'note', 'badge']);
		expect(attached.open).toBe(false);
		expect(attached.mode).toBeNull();

		harness.controller.detach();
		const detached = get(harness.controller);
		expect(detached.allowedBlockIds).toEqual([]);
		expect(detached.open).toBe(false);
		expect(detached.activeBlock).toBeNull();

		harness.host.remove();
	});
});

describe('attributesController — syncFromSelection selection taxonomy', () => {
	it('caret in a plain paragraph yields no active block and keeps the panel closed', () => {
		const harness = createHarness(paragraphDoc());
		harness.editor.commands.setTextSelection(1);
		harness.controller.syncFromSelection('selection');

		const state = get(harness.controller);
		expect(state.activeBlock).toBeNull();
		expect(state.open).toBe(false);
		expect(state.mode).toBeNull();

		harness.cleanup();
	});

	it('selecting a leaf custom block records it as active but does not auto-open', () => {
		const harness = createHarness({
			type: 'doc',
			content: [{ type: 'note', attrs: { title: 'N' } }, { type: 'paragraph' }]
		});
		selectNode(harness.editor, posOf(harness.editor, 'note'));
		harness.controller.syncFromSelection('selection');

		const state = get(harness.controller);
		expect(state.activeBlock?.id).toBe('note');
		expect(state.open).toBe(false);
		expect(state.mode).toBeNull();
		expect(state.selectedBlockId).toBe('');

		harness.cleanup();
	});

	it('selecting a code block auto-opens the panel in edit mode (the CODE_BLOCK_ID path)', () => {
		// Lead with a paragraph so the default post-attach caret lands there (panel
		// closed); selecting the code block is what must trigger the auto-open.
		const harness = createHarness({
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: 'lead' }] },
				{ type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1;' }] }
			]
		});
		harness.editor.commands.setTextSelection(1);
		harness.controller.syncFromSelection('selection');
		expect(get(harness.controller).open).toBe(false);

		selectNode(harness.editor, posOf(harness.editor, CODE_BLOCK_ID));
		harness.controller.syncFromSelection('selection');

		const state = get(harness.controller);
		expect(state.open).toBe(true);
		expect(state.mode).toBe('edit');
		expect(state.selectedBlockId).toBe(CODE_BLOCK_ID);
		expect(state.draftAttrs).toHaveProperty('language');

		harness.cleanup();
	});

	it('caret inside a container child resolves the container as active and derives its children', () => {
		const harness = createHarness({
			type: 'doc',
			content: [
				{
					type: 'section',
					attrs: { title: 'Sec' },
					content: [{ type: 'paragraph', content: [{ type: 'text', text: 'child copy' }] }]
				}
			]
		});
		harness.editor.commands.setTextSelection(posOf(harness.editor, 'paragraph') + 1);
		harness.controller.syncFromSelection('selection');

		const state = get(harness.controller);
		expect(state.activeBlock?.id).toBe('section');
		expect(state.containerChildren).toHaveLength(1);
		expect(state.open).toBe(false);

		harness.cleanup();
	});

	it('moving the selection to a different block closes an open edit panel', () => {
		const harness = createHarness({
			type: 'doc',
			content: [
				{ type: 'note', attrs: { title: 'A' } },
				{ type: 'badge', attrs: { label: 'x' } }
			]
		});
		selectNode(harness.editor, posOf(harness.editor, 'note'));
		harness.controller.openAttributes();
		expect(get(harness.controller)).toMatchObject({
			open: true,
			mode: 'edit',
			selectedBlockId: 'note'
		});

		selectNode(harness.editor, posOf(harness.editor, 'badge'));
		harness.controller.syncFromSelection('selection');

		const state = get(harness.controller);
		expect(state.open).toBe(false);
		expect(state.mode).toBeNull();

		harness.cleanup();
	});

	it('keeps the panel on the container when an update-sync lands on a child atom', () => {
		// With the panel explicitly opened on a container, an 'update' sync whose
		// selection resolves to a child atom must NOT steal the panel over to the
		// child — the container edit is preserved by `shouldPreserveContainerOnUpdate`
		// (a durable, time-independent guard; slice 03 step 2 removed the parallel
		// wall-clock leg that used to mask this).
		const harness = createHarness({
			type: 'doc',
			content: [
				{
					type: 'section',
					attrs: { title: 'Sec' },
					content: [{ type: 'note', attrs: { title: 'child' } }]
				}
			]
		});
		harness.controller.openAttributesAt(posOf(harness.editor, 'section'));
		expect(get(harness.controller).selectedBlockId).toBe('section');

		selectNode(harness.editor, posOf(harness.editor, 'note'));
		harness.controller.syncFromSelection('update');

		expect(get(harness.controller).selectedBlockId).toBe('section');
		expect(get(harness.controller).mode).toBe('edit');

		harness.cleanup();
	});

	it('re-syncing an unchanged selection produces a stable state snapshot', () => {
		const harness = createHarness(paragraphDoc());
		harness.editor.commands.setTextSelection(1);
		harness.controller.syncFromSelection('selection');
		const before = get(harness.controller);
		harness.controller.syncFromSelection('selection');
		const after = get(harness.controller);

		// The controller allocates a fresh object each sync (Svelte notifies every
		// time), but the meaningful state must not churn on an unchanged selection.
		expect(after.open).toBe(before.open);
		expect(after.mode).toBe(before.mode);
		expect(after.selectedBlockId).toBe(before.selectedBlockId);
		expect(after.activeBlock).toEqual(before.activeBlock);

		harness.cleanup();
	});
});

describe('attributesController — open/close and mode transitions', () => {
	it('openAttributes() with no selection or draft target does nothing', () => {
		const harness = createHarness(paragraphDoc());
		harness.editor.commands.setTextSelection(1);
		harness.controller.openAttributes();

		expect(get(harness.controller).open).toBe(false);

		harness.cleanup();
	});

	it('openAttributes(blockId) with no matching active block opens in insert mode with default draft', () => {
		const harness = createHarness(paragraphDoc());
		harness.editor.commands.setTextSelection(1);
		harness.controller.openAttributes('note');

		const state = get(harness.controller);
		expect(state.open).toBe(true);
		expect(state.mode).toBe('insert');
		expect(state.selectedBlockId).toBe('note');
		expect(state.draftAttrs).toEqual({ title: '' });

		harness.cleanup();
	});

	it('openAttributes() on a selected leaf block opens in edit mode with prefilled draft', () => {
		const harness = createHarness({
			type: 'doc',
			content: [{ type: 'note', attrs: { title: 'Prefilled' } }]
		});
		selectNode(harness.editor, posOf(harness.editor, 'note'));
		harness.controller.openAttributes();

		const state = get(harness.controller);
		expect(state.open).toBe(true);
		expect(state.mode).toBe('edit');
		expect(state.selectedBlockId).toBe('note');
		expect(state.draftAttrs).toEqual({ title: 'Prefilled' });

		harness.cleanup();
	});

	it('closeAttributes() clears open/mode/errors but leaves the active block', () => {
		const harness = createHarness({
			type: 'doc',
			content: [{ type: 'note', attrs: { title: 'N' } }]
		});
		selectNode(harness.editor, posOf(harness.editor, 'note'));
		harness.controller.openAttributes();
		harness.controller.closeAttributes();

		const state = get(harness.controller);
		expect(state.open).toBe(false);
		expect(state.mode).toBeNull();
		expect(state.validationErrors).toEqual({});

		harness.cleanup();
	});

	it('openAttributesAt() on a container selects it, populates children, and suppresses auto-open during its own selection echo', () => {
		const harness = createHarness({
			type: 'doc',
			content: [
				{
					type: 'section',
					attrs: { title: 'Sec' },
					content: [
						{ type: 'note', attrs: { title: 'one' } },
						{ type: 'note', attrs: { title: 'two' } }
					]
				}
			]
		});
		// The programmatic node-selection dispatched by openAttributesAt fires a
		// synchronous selectionUpdate; bindEditor consults isSelectionAutoOpenSuppressed()
		// exactly then, so suppression must be active DURING that echo.
		const suppressedDuringEcho: boolean[] = [];
		harness.editor.on('selectionUpdate', () => {
			suppressedDuringEcho.push(harness.controller.isSelectionAutoOpenSuppressed());
		});

		harness.controller.openAttributesAt(posOf(harness.editor, 'section'));

		const state = get(harness.controller);
		expect(state.open).toBe(true);
		expect(state.mode).toBe('edit');
		expect(state.selectedBlockId).toBe('section');
		expect(state.containerChildren).toHaveLength(2);
		expect(suppressedDuringEcho.some(Boolean)).toBe(true);
		// Suppression is one-shot: cleared as soon as the dispatch returns, so it
		// can never wedge a later genuine selection.
		expect(harness.controller.isSelectionAutoOpenSuppressed()).toBe(false);

		harness.cleanup();
	});

	it('openAttributesAt() leaves no auto-open suppression armed after it returns', () => {
		const harness = createHarness({
			type: 'doc',
			content: [{ type: 'note', attrs: { title: 'N' } }]
		});
		harness.controller.openAttributesAt(posOf(harness.editor, 'note'));

		expect(get(harness.controller).selectedBlockId).toBe('note');
		expect(harness.controller.isSelectionAutoOpenSuppressed()).toBe(false);

		harness.cleanup();
	});
});

describe('attributesController — one-shot auto-open suppression (event-based)', () => {
	// Slice 03 step 2 replaced the wall-clock `Date.now() + N` deadlines with a
	// flag raised only for the synchronous span of the controller's own dispatch.
	// These tests pin the two properties that matter: (1) the flag is active while
	// the self-triggered selection echo is processed, and (2) it is always cleared
	// afterward, so it can never wedge auto-open for a subsequent genuine event.
	function containerHarness(): Harness {
		return createHarness({
			type: 'doc',
			content: [
				{
					type: 'section',
					attrs: { title: 'Sec' },
					content: [
						{ type: 'note', attrs: { title: 'one' } },
						{ type: 'note', attrs: { title: 'two' } }
					]
				}
			]
		});
	}

	it('is cleared after every container mutation, never lingering across ops', () => {
		const harness = containerHarness();
		harness.controller.openAttributesAt(posOf(harness.editor, 'section'));
		expect(harness.controller.isSelectionAutoOpenSuppressed()).toBe(false);

		harness.controller.insertContainerChild('note', { title: 'three' });
		expect(harness.controller.isSelectionAutoOpenSuppressed()).toBe(false);

		harness.controller.moveContainerChild(0, 2);
		expect(harness.controller.isSelectionAutoOpenSuppressed()).toBe(false);

		harness.controller.removeContainerChild(0);
		expect(harness.controller.isSelectionAutoOpenSuppressed()).toBe(false);

		harness.cleanup();
	});

	it('suppresses auto-open during a child-op dispatch echo but not before or after', () => {
		const harness = containerHarness();
		harness.controller.openAttributesAt(posOf(harness.editor, 'section'));

		const suppressedDuringEcho: boolean[] = [];
		harness.editor.on('update', () => {
			suppressedDuringEcho.push(harness.controller.isSelectionAutoOpenSuppressed());
		});

		expect(harness.controller.isSelectionAutoOpenSuppressed()).toBe(false);
		harness.controller.insertContainerChild('note', { title: 'three' });
		// The doc-changing dispatch fired a synchronous update echo while the flag
		// was raised; it is lowered again by the time control returns here.
		expect(suppressedDuringEcho.some(Boolean)).toBe(true);
		expect(harness.controller.isSelectionAutoOpenSuppressed()).toBe(false);

		harness.cleanup();
	});
});

describe('attributesController — draft editing and validation', () => {
	it('surfaces a required-field error and does not write it through to the doc', () => {
		const harness = createHarness({
			type: 'doc',
			content: [{ type: 'badge', attrs: { label: 'orig', weight: 1 } }]
		});
		const pos = posOf(harness.editor, 'badge');
		selectNode(harness.editor, pos);
		harness.controller.openAttributes();

		harness.controller.setDraftAttr('label', '');

		expect(get(harness.controller).validationErrors.label).toBe('Required');
		// The invalid draft is NOT applied to the document.
		expect(harness.editor.state.doc.nodeAt(pos)?.attrs.label).toBe('orig');

		harness.cleanup();
	});

	it('applies a valid edit-mode draft live to the document node', () => {
		const harness = createHarness({
			type: 'doc',
			content: [{ type: 'badge', attrs: { label: 'orig', weight: 1 } }]
		});
		const pos = posOf(harness.editor, 'badge');
		selectNode(harness.editor, pos);
		harness.controller.openAttributes();

		harness.controller.setDraftAttr('label', 'updated');

		expect(get(harness.controller).validationErrors.label).toBe('');
		expect(harness.editor.state.doc.nodeAt(pos)?.attrs.label).toBe('updated');

		harness.cleanup();
	});

	it('applies a valid edit to one field while a sibling field is invalid', () => {
		const harness = createHarness({
			type: 'doc',
			content: [{ type: 'badge', attrs: { label: 'orig', weight: 1 } }]
		});
		const pos = posOf(harness.editor, 'badge');
		selectNode(harness.editor, pos);
		harness.controller.openAttributes();

		// Arm the trap: required `label` is now invalid in the draft.
		harness.controller.setDraftAttr('label', '');
		// Edit a DIFFERENT, valid field.
		harness.controller.setDraftAttr('weight', 2);

		const node = harness.editor.state.doc.nodeAt(pos);
		// The valid edit is written through; the invalid draft value is not.
		expect(node?.attrs.weight).toBe(2);
		expect(node?.attrs.label).toBe('orig');
		// The sibling's error stays visible so the user knows why label lags.
		expect(get(harness.controller).validationErrors.label).toBe('Required');

		harness.cleanup();
	});

	it('recovering an invalid field applies it and clears its error', () => {
		const harness = createHarness({
			type: 'doc',
			content: [{ type: 'badge', attrs: { label: 'orig', weight: 1 } }]
		});
		const pos = posOf(harness.editor, 'badge');
		selectNode(harness.editor, pos);
		harness.controller.openAttributes();

		harness.controller.setDraftAttr('label', '');
		harness.controller.setDraftAttr('weight', 2);
		harness.controller.setDraftAttr('label', 'fixed');

		const node = harness.editor.state.doc.nodeAt(pos);
		expect(node?.attrs.label).toBe('fixed');
		expect(node?.attrs.weight).toBe(2);
		expect(get(harness.controller).validationErrors.label).toBe('');

		harness.cleanup();
	});

	it('keeps sibling validation errors visible across the real update-event echo', () => {
		// setDraftAttr's write-through dispatch fires Tiptap's `update` event,
		// which bindEditor routes back into syncFromSelection('update'). That
		// echo must not wipe the sibling field's error while its draft is still
		// invalid.
		const host = document.createElement('div');
		document.body.append(host);
		const registry = createBlockRegistry([badgeBlock]);
		const schema = createSchema(registry);
		const controller = createBlockAttributesController();
		let editor: TiptapEditor | null = null;
		const action = bindEditor(host, {
			blocks: registry,
			schema,
			attributesController: controller,
			json: { type: 'doc', content: [{ type: 'badge', attrs: { label: 'orig', weight: 1 } }] },
			onEditor: (next) => {
				if (next) editor = next;
			}
		});

		const boundEditor = editor as TiptapEditor | null;
		if (!boundEditor) throw new Error('editor was not attached');
		const pos = posOf(boundEditor, 'badge');
		controller.openAttributesAt(pos);

		controller.setDraftAttr('label', '');
		controller.setDraftAttr('weight', 2);

		expect(boundEditor.state.doc.nodeAt(pos)?.attrs.weight).toBe(2);
		expect(get(controller).validationErrors.label).toBe('Required');
		expect(get(controller).draftAttrs.label).toBe('');

		action.destroy?.();
		host.remove();
	});

	it('commit() in insert mode gates on validation, then inserts the block and closes', () => {
		const harness = createHarness(paragraphDoc());
		harness.editor.commands.setTextSelection(1);
		harness.controller.openAttributes('badge');

		// Required `label` is empty → commit is refused and errors surface.
		expect(harness.controller.commit()).toBe(false);
		expect(get(harness.controller).validationErrors.label).toBe('Required');
		expect(posOf(harness.editor, 'badge')).toBe(-1);

		// With a valid draft, commit inserts the block and closes the panel.
		harness.controller.setDraftAttr('label', 'Hi');
		expect(harness.controller.commit()).toBe(true);
		expect(posOf(harness.editor, 'badge')).toBeGreaterThanOrEqual(0);
		expect(get(harness.controller).open).toBe(false);

		harness.cleanup();
	});
});

describe('attributesController — container child operations', () => {
	function containerHarness(): Harness {
		return createHarness({
			type: 'doc',
			content: [
				{
					type: 'section',
					attrs: { title: 'Sec' },
					content: [
						{ type: 'note', attrs: { title: 'one' } },
						{ type: 'note', attrs: { title: 'two' } }
					]
				}
			]
		});
	}

	function childTitles(state: BlockAttributesState): string[] {
		return state.containerChildren.map((child) => child.summary);
	}

	it('insert, move, and remove keep containerChildren mirroring the document', () => {
		const harness = containerHarness();
		harness.controller.openAttributesAt(posOf(harness.editor, 'section'));
		expect(childTitles(get(harness.controller))).toEqual(['one', 'two']);

		expect(harness.controller.insertContainerChild('note', { title: 'three' })).toBe(true);
		expect(childTitles(get(harness.controller))).toEqual(['one', 'two', 'three']);

		expect(harness.controller.moveContainerChild(0, 2)).toBe(true);
		expect(childTitles(get(harness.controller))).toEqual(['two', 'three', 'one']);

		expect(harness.controller.removeContainerChild(1)).toBe(true);
		expect(childTitles(get(harness.controller))).toEqual(['two', 'one']);

		harness.cleanup();
	});

	it('removeContainerChild refuses to remove the last remaining child', () => {
		const harness = createHarness({
			type: 'doc',
			content: [
				{
					type: 'section',
					attrs: { title: 'Sec' },
					content: [{ type: 'note', attrs: { title: 'only' } }]
				}
			]
		});
		harness.controller.openAttributesAt(posOf(harness.editor, 'section'));

		expect(harness.controller.removeContainerChild(0)).toBe(false);
		expect(get(harness.controller).containerChildren).toHaveLength(1);

		harness.cleanup();
	});

	it('removeActiveBlock deletes the selected block and closes the panel', () => {
		const harness = createHarness({
			type: 'doc',
			content: [{ type: 'note', attrs: { title: 'gone' } }, { type: 'paragraph' }]
		});
		harness.controller.openAttributesAt(posOf(harness.editor, 'note'));
		expect(harness.controller.removeActiveBlock()).toBe(true);

		expect(posOf(harness.editor, 'note')).toBe(-1);
		expect(get(harness.controller).open).toBe(false);

		harness.cleanup();
	});
});

describe('attributesController — link editing', () => {
	it('commits a link over a text range, prefills from the existing mark, and removes it', () => {
		const harness = createHarness(paragraphDoc('Hello world'));
		// Select the word "Hello": text starts at pos 1 inside the paragraph.
		harness.editor.commands.setTextSelection({ from: 1, to: 6 });

		harness.controller.openLinkAttributes();
		expect(get(harness.controller).link.open).toBe(true);

		harness.controller.setLinkAttr('href', 'https://example.com');
		harness.controller.setLinkAttr('title', 'My title');
		expect(harness.controller.commitLinkAttributes()).toBe(true);
		expect(harness.editor.isActive('link')).toBe(true);
		expect(harness.editor.getAttributes('link')).toMatchObject({
			href: 'https://example.com',
			title: 'My title'
		});

		// Place the caret inside the linked text; syncFromSelection surfaces the
		// existing mark's attributes into link state.
		harness.editor.commands.setTextSelection(3);
		harness.controller.syncFromSelection('selection');
		expect(get(harness.controller).link).toMatchObject({
			open: true,
			attrs: { href: 'https://example.com' }
		});

		// Directly re-opening the link editor also prefills from the active mark.
		harness.controller.openLinkAttributes();
		expect(get(harness.controller).link.attrs.href).toBe('https://example.com');

		expect(harness.controller.removeLink()).toBe(true);
		expect(harness.editor.isActive('link')).toBe(false);
		expect(get(harness.controller).link.open).toBe(false);

		harness.cleanup();
	});

	it('refuses to commit a link with an empty/invalid href', () => {
		const harness = createHarness(paragraphDoc('Hello world'));
		harness.editor.commands.setTextSelection({ from: 1, to: 6 });

		harness.controller.openLinkAttributes();
		harness.controller.setLinkAttr('href', '');
		expect(harness.controller.commitLinkAttributes()).toBe(false);
		expect(harness.editor.isActive('link')).toBe(false);

		harness.cleanup();
	});
});

describe('attributesController — auto-open suppression through real bindEditor wiring', () => {
	// The characterization tests above drive syncFromSelection by hand. This one
	// wires the controller through bindEditor (which calls syncFromSelection and
	// the auto-open check on the editor's real selectionUpdate/update events) to
	// prove the synchronous one-shot suppression that replaced the wall-clock
	// windows survives end to end: a container child op must not let a late echo
	// steal the panel over to a leaf — including across microtask/rAF/timer flushes
	// where an async NodeView re-render echo, if any existed, would surface.
	it('keeps the panel on the container after a child op, across async flushes', async () => {
		const host = document.createElement('div');
		document.body.append(host);
		const registry = createBlockRegistry([containerBlock, atomBlock]);
		const schema = createSchema(registry);
		const controller = createBlockAttributesController();
		let editor: TiptapEditor | null = null;
		const action = bindEditor(host, {
			blocks: registry,
			schema,
			attributesController: controller,
			json: {
				type: 'doc',
				content: [
					{
						type: 'section',
						attrs: { title: 'Sec' },
						content: [
							{ type: 'note', attrs: { title: 'one' } },
							{ type: 'note', attrs: { title: 'two' } }
						]
					}
				]
			},
			onEditor: (next) => {
				if (next) editor = next;
			}
		});

		const boundEditor = editor as TiptapEditor | null;
		if (!boundEditor) throw new Error('editor was not attached');
		controller.openAttributesAt(posOf(boundEditor, 'section'));
		expect(get(controller).selectedBlockId).toBe('section');

		controller.insertContainerChild('note', { title: 'three' });
		expect(get(controller)).toMatchObject({ selectedBlockId: 'section', open: true });

		await Promise.resolve();
		await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(get(controller)).toMatchObject({ selectedBlockId: 'section', open: true });

		action.destroy?.();
		host.remove();
	});
});
