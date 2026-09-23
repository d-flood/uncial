import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ImagePicker from './ImagePicker.svelte';

function openPicker(browse: () => Promise<string[]>) {
	const rendered = render(ImagePicker, { browse, current: '', onPick: () => {} });
	rendered.component.open();
	return rendered.container.querySelector('dialog')!;
}

describe('image picker states', () => {
	it('shows a loading status while browsing', async () => {
		const dialog = openPicker(() => new Promise(() => {}));
		await expect
			.poll(() => dialog.querySelector('[role="status"]')?.textContent)
			.toBe('Loading images…');
	});

	it('shows an empty-state message when there are no images', async () => {
		const dialog = openPicker(async () => []);
		await expect.poll(() => dialog.textContent).toContain('No images yet.');
	});

	it('shows the browse error as an alert', async () => {
		const dialog = openPicker(async () => {
			throw new Error('Listing failed');
		});
		await expect
			.poll(() => dialog.querySelector('[role="alert"]')?.textContent)
			.toBe('Listing failed');
	});

	it('closes from its close button', async () => {
		const dialog = openPicker(async () => []);
		expect(dialog.open).toBe(true);
		dialog.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click();
		expect(dialog.open).toBe(false);
	});
});
