import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { defineSvelteBlock } from '../runtime/svelte.js';
import EditorBlockFixture from '../shared/EditorBlockFixture.svelte';
import BlockAttributesPanel from './BlockAttributesPanel.svelte';
import {
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

function editingImageState(): BlockAttributesState {
	return {
		...createInitialState(),
		open: true,
		mode: 'edit',
		selectedBlockId: 'image',
		draftAttrs: { imageId: 0 }
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
