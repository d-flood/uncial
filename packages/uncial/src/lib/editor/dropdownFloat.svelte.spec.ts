import { describe, expect, it } from 'vitest';
import { dropdownDismiss } from './dropdownDismiss.js';
import { dropdownFloat } from './dropdownFloat.js';

interface Harness {
	details: HTMLDetailsElement;
	summary: HTMLElement;
	menu: HTMLElement;
	panel: HTMLElement;
	entries: HTMLButtonElement[];
	clicked: string[];
	cleanup(): void;
}

/**
 * A dropdown inside a scroll box shaped like the attributes sidebar's panel:
 * `position: sticky` with a `max-height` and `overflow-y: auto`, which clips a
 * menu laid out inside it at the panel's edge.
 */
function mountClippedDropdown(
	options: { entryCount?: number; panelHeight?: number; spacerBefore?: number } = {}
): Harness {
	const { entryCount = 24, panelHeight = 160, spacerBefore = 0 } = options;
	const clicked: string[] = [];

	const panel = document.createElement('div');
	panel.className = 'uncial-attrs-panel';
	panel.style.cssText = `width: 18rem; max-height: ${panelHeight}px; overflow-y: auto; position: sticky; top: 0;`;

	if (spacerBefore) {
		const spacer = document.createElement('div');
		spacer.style.height = `${spacerBefore}px`;
		panel.append(spacer);
	}

	const details = document.createElement('details');
	details.className = 'uncial-dropdown uncial-dropdown--end';
	// `position: relative` and the menu's offsets come from the stylesheet, which
	// the test page does not load.
	details.style.position = 'relative';
	const summary = document.createElement('summary');
	summary.textContent = 'Add block';

	const menu = document.createElement('div');
	menu.className = 'uncial-dropdown__menu';
	menu.style.cssText = 'position: absolute; top: 100%; right: 0; width: 14rem; background: white;';
	const entries: HTMLButtonElement[] = [];
	for (let index = 0; index < entryCount; index += 1) {
		const entry = document.createElement('button');
		entry.type = 'button';
		entry.textContent = `Block ${index}`;
		entry.style.cssText = 'display: block; width: 100%; padding: 0.5rem;';
		entry.addEventListener('click', () => clicked.push(entry.textContent ?? ''));
		entries.push(entry);
		menu.append(entry);
	}

	details.append(summary, menu);
	panel.append(details);
	const filler = document.createElement('div');
	filler.style.height = '600px';
	panel.append(filler);
	document.body.append(panel);

	const dismiss = dropdownDismiss(details);
	const float = dropdownFloat(details);

	return {
		details,
		summary,
		menu,
		panel,
		entries,
		clicked,
		cleanup() {
			float.destroy?.();
			dismiss.destroy?.();
			panel.remove();
		}
	};
}

function withinViewport(element: Element): boolean {
	const rect = element.getBoundingClientRect();
	return (
		rect.top >= 0 &&
		rect.left >= 0 &&
		rect.bottom <= window.innerHeight &&
		rect.right <= window.innerWidth &&
		rect.height > 0
	);
}

/** The topmost element at an element's centre, which is what a click lands on. */
function hitAtCentre(element: Element): Element | null {
	const rect = element.getBoundingClientRect();
	return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

const nextFrame = (): Promise<void> =>
	new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * The entries a click would not land on. Only the menu's own scroll is used to
 * bring an entry into view — the panel's scroll position must not matter.
 */
async function unclickable(menu: HTMLElement, entries: HTMLButtonElement[]): Promise<string[]> {
	const unreached: string[] = [];
	for (const entry of entries) {
		menu.scrollTop = entry.offsetTop;
		await nextFrame();
		if (!withinViewport(entry) || hitAtCentre(entry) !== entry) {
			unreached.push(entry.textContent ?? '');
		}
	}
	return unreached;
}

async function open(harness: Harness): Promise<void> {
	const toggled = new Promise<void>((resolve) => {
		harness.details.addEventListener('toggle', () => resolve(), { once: true });
	});
	harness.summary.click();
	await toggled;
	await nextFrame();
}

describe('dropdownFloat', () => {
	it('makes every entry of a menu in a clipping scroll box clickable', async () => {
		const harness = mountClippedDropdown();

		await open(harness);

		expect(withinViewport(harness.menu)).toBe(true);
		expect(await unclickable(harness.menu, harness.entries)).toEqual([]);
		harness.entries[harness.entries.length - 1].click();
		expect(harness.clicked).toEqual(['Block 23']);

		harness.cleanup();
	});

	it('keeps the menu anchored to its summary when the panel scrolls', async () => {
		const harness = mountClippedDropdown({ entryCount: 8, spacerBefore: 120 });

		await open(harness);
		const offsetBefore =
			harness.menu.getBoundingClientRect().top - harness.summary.getBoundingClientRect().bottom;
		harness.panel.scrollTop = 60;
		harness.panel.dispatchEvent(new Event('scroll', { bubbles: true }));
		await nextFrame();

		expect(
			harness.menu.getBoundingClientRect().top - harness.summary.getBoundingClientRect().bottom
		).toBeCloseTo(offsetBefore, 0);
		expect(await unclickable(harness.menu, harness.entries)).toEqual([]);

		harness.cleanup();
	});

	it('caps a menu taller than the viewport and lets it scroll on its own', async () => {
		const harness = mountClippedDropdown({ entryCount: 200 });

		await open(harness);

		expect(withinViewport(harness.menu)).toBe(true);
		expect(harness.menu.scrollHeight).toBeGreaterThan(harness.menu.clientHeight);
		const ends = [harness.entries[0], harness.entries[harness.entries.length - 1]];
		expect(await unclickable(harness.menu, ends)).toEqual([]);

		harness.cleanup();
	});

	it('opens above the summary when there is no room below', async () => {
		const harness = mountClippedDropdown();
		harness.panel.style.position = 'fixed';
		harness.panel.style.top = `${window.innerHeight - 40}px`;

		await open(harness);

		expect(harness.menu.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			harness.summary.getBoundingClientRect().top
		);
		expect(withinViewport(harness.menu)).toBe(true);

		harness.cleanup();
	});

	it('leaves dismissal to dropdownDismiss', async () => {
		const harness = mountClippedDropdown();

		await open(harness);
		harness.summary.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await nextFrame();

		expect(harness.details.open).toBe(false);
		expect(harness.menu.getBoundingClientRect().height).toBe(0);

		harness.cleanup();
	});
});
