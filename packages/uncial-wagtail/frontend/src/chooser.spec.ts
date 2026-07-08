import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	chooseImageForAttribute,
	getChooserBridge,
	getWagtailImagePreview,
	isChooserCancelled
} from './chooser.js';
import type { WagtailChooserOutcome } from './chooser.js';
import type { ChooseAttributeEvent } from './imageBrowser.js';

const DIALOG_SELECTOR = 'dialog.uncial-wagtail-image-browser';

function makeChooseEvent(attrs: Record<string, unknown> = {}) {
	const setAttrs = vi.fn();
	const event = new CustomEvent('uncial:choose-attribute', {
		detail: { inputKind: 'wagtail-image', name: 'imageId', attrs, setAttrs }
	}) as ChooseAttributeEvent;
	return { event, setAttrs };
}

function stubImagesEndpoint(images: unknown[] = []) {
	const fetchMock = vi.fn(async () => ({
		ok: true,
		json: async () => ({ images })
	}));
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

beforeEach(() => {
	delete window.uncialWagtail;
});

afterEach(() => {
	delete window.uncialWagtail;
	document.querySelectorAll('dialog').forEach((dialog) => dialog.remove());
	vi.unstubAllGlobals();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('getChooserBridge', () => {
	it('detects the bridge synchronously and only when it is a function', () => {
		expect(getChooserBridge()).toBeUndefined();

		window.uncialWagtail = {};
		expect(getChooserBridge()).toBeUndefined();

		const chooseImage = vi.fn(async () => null);
		window.uncialWagtail = { chooseImage };
		expect(getChooserBridge()).toBe(chooseImage);
	});
});

describe('chooseImageForAttribute with an available bridge', () => {
	it('never opens the fallback dialog even when choosing takes longer than 1.5s', async () => {
		vi.useFakeTimers();
		const fetchMock = stubImagesEndpoint();
		const { event, setAttrs } = makeChooseEvent();
		window.uncialWagtail = {
			chooseImage: vi.fn(
				() =>
					new Promise<WagtailChooserOutcome>((resolve) => {
						setTimeout(
							() => resolve({ id: 7, title: 'Slowly chosen', previewUrl: '/p.png' }),
							60_000
						);
					})
			)
		};

		const pending = chooseImageForAttribute(event);

		// Well past the old 1.5s withTimeout: nothing must happen yet.
		await vi.advanceTimersByTimeAsync(59_000);
		expect(document.querySelector(DIALOG_SELECTOR)).toBeNull();
		expect(setAttrs).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1_000);
		await pending;

		expect(document.querySelector(DIALOG_SELECTOR)).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(setAttrs).toHaveBeenCalledWith({
			imageId: 7,
			previewUrl: '/p.png',
			alt: 'Slowly chosen'
		});
	});

	it('passes the current image id as selectedId and keeps an existing alt', async () => {
		const chooseImage = vi.fn(async (): Promise<WagtailChooserOutcome> => ({
			id: 9,
			title: 'Nine'
		}));
		window.uncialWagtail = { chooseImage };
		const { event, setAttrs } = makeChooseEvent({ imageId: 4, alt: 'Existing alt' });

		await chooseImageForAttribute(event);

		expect(chooseImage).toHaveBeenCalledWith({ selectedId: 4 });
		expect(setAttrs).toHaveBeenCalledWith({ imageId: 9, previewUrl: '', alt: 'Existing alt' });
	});

	it('does nothing when the user cancels the modal: no fallback dialog, no attr change', async () => {
		const fetchMock = stubImagesEndpoint();
		window.uncialWagtail = { chooseImage: vi.fn(async () => ({ cancelled: true }) as const) };
		const { event, setAttrs } = makeChooseEvent();

		await chooseImageForAttribute(event);

		expect(document.querySelector(DIALOG_SELECTOR)).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(setAttrs).not.toHaveBeenCalled();
	});
});

describe('chooseImageForAttribute fallback dialog', () => {
	it('opens the dialog when the bridge reports it could not open (null)', async () => {
		const fetchMock = stubImagesEndpoint([{ id: 3, title: 'Fallback pick' }]);
		window.uncialWagtail = { chooseImage: vi.fn(async () => null) };
		const { event } = makeChooseEvent();

		await chooseImageForAttribute(event);

		expect(document.querySelector(DIALOG_SELECTOR)).not.toBeNull();
		expect(fetchMock).toHaveBeenCalledWith('/api/uncial/images/');
	});

	it('opens the dialog when no bridge exists, using the configured images URL', async () => {
		const fetchMock = stubImagesEndpoint([{ id: 3, title: 'Fallback pick' }]);
		const { event, setAttrs } = makeChooseEvent();

		await chooseImageForAttribute(event, { images: '/cms/api/uncial/images/' });

		expect(fetchMock).toHaveBeenCalledWith('/cms/api/uncial/images/');
		const dialog = document.querySelector(DIALOG_SELECTOR);
		expect(dialog).not.toBeNull();

		dialog?.querySelector<HTMLButtonElement>('.uncial-wagtail-image-choice')?.click();
		expect(setAttrs).toHaveBeenCalledWith({ imageId: 3, previewUrl: '', alt: 'Fallback pick' });
	});
});

describe('isChooserCancelled', () => {
	it('distinguishes cancellation from results and unavailability', () => {
		expect(isChooserCancelled({ cancelled: true })).toBe(true);
		expect(isChooserCancelled(null)).toBe(false);
		expect(isChooserCancelled({ id: 1, title: 'Image' })).toBe(false);
	});
});

describe('getWagtailImagePreview', () => {
	it('queries the configured images endpoint with the id', async () => {
		const fetchMock = stubImagesEndpoint([{ id: 12, title: 'Preview me' }]);

		const preview = await getWagtailImagePreview(12, { images: '/cms/api/uncial/images/' });

		expect(fetchMock).toHaveBeenCalledWith('/cms/api/uncial/images/?id=12');
		expect(preview).toEqual({ id: 12, title: 'Preview me' });
	});

	it('falls back to the hardcoded endpoint without config', async () => {
		const fetchMock = stubImagesEndpoint([]);

		const preview = await getWagtailImagePreview(12);

		expect(fetchMock).toHaveBeenCalledWith('/api/uncial/images/?id=12');
		expect(preview).toBeNull();
	});
});
