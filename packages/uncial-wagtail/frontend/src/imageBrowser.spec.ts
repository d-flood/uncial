import { describe, expect, it, vi } from 'vitest';
import { createImageButton } from './imageBrowser.js';
import type { WagtailImage } from './imageBrowser.js';

describe('createImageButton', () => {
	it('renders a hostile image title as literal text', () => {
		const image: WagtailImage = {
			id: 1,
			title: '<img src=x onerror="window.__pwned=1">'
		};

		const button = createImageButton(image, () => {});
		document.body.append(button);

		expect(button.querySelector('img[src="x"]')).toBeNull();
		expect(button.querySelector('strong')?.textContent).toBe(image.title);
		expect((window as { __pwned?: unknown }).__pwned).toBeUndefined();

		button.remove();
	});

	it('sets previewUrl as an attribute, not markup', () => {
		const previewUrl = '"><img src=y onerror="window.__pwned=1"><img src="';
		const image: WagtailImage = { id: 2, title: 'Safe title', previewUrl };

		const button = createImageButton(image, () => {});
		document.body.append(button);

		const previews = button.querySelectorAll('img');
		expect(previews).toHaveLength(1);
		expect(previews[0]?.getAttribute('src')).toBe(previewUrl);
		expect((window as { __pwned?: unknown }).__pwned).toBeUndefined();

		button.remove();
	});

	it('shows a placeholder without a previewUrl and calls onChoose on click', () => {
		const image: WagtailImage = { id: 3, title: 'Plain', width: 640, height: 480 };
		const onChoose = vi.fn();

		const button = createImageButton(image, onChoose);

		expect(button.querySelector('img')).toBeNull();
		expect(button.querySelector('span')?.textContent).toBe('No preview');
		expect(button.querySelector('small')?.textContent).toBe('#3 · 640x480');

		button.click();
		expect(onChoose).toHaveBeenCalledWith(image);
	});
});
