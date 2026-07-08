import { describe, expect, it } from 'vitest';
import { dropdownDismiss } from './dropdownDismiss.js';

function mountDetails() {
	const details = document.createElement('details');
	const summary = document.createElement('summary');
	summary.textContent = 'Menu';
	summary.tabIndex = 0;
	const menu = document.createElement('div');
	const inner = document.createElement('button');
	inner.textContent = 'Inside';
	menu.append(inner);
	details.append(summary, menu);
	document.body.append(details);
	const action = dropdownDismiss(details);
	return {
		details,
		summary,
		inner,
		cleanup() {
			action.destroy?.();
			details.remove();
		}
	};
}

describe('dropdownDismiss', () => {
	it('closes on Escape and returns focus to the summary', () => {
		const { details, summary, cleanup } = mountDetails();
		details.open = true;
		summary.focus();

		summary.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		expect(details.open).toBe(false);
		expect(document.activeElement).toBe(summary);
		cleanup();
	});

	it('closes on an outside pointer press without stealing focus', () => {
		const outside = document.createElement('button');
		document.body.append(outside);
		const { details, cleanup } = mountDetails();
		details.open = true;

		outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

		expect(details.open).toBe(false);
		outside.remove();
		cleanup();
	});

	it('stays open when the interaction happens inside the menu', () => {
		const { details, inner, cleanup } = mountDetails();
		details.open = true;

		inner.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

		expect(details.open).toBe(true);
		cleanup();
	});

	it('detaches its document listeners on destroy', () => {
		const outside = document.createElement('button');
		document.body.append(outside);
		const { details, cleanup } = mountDetails();
		details.open = true;

		cleanup();
		outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

		// The action no longer reacts once destroyed.
		expect(details.open).toBe(true);
		outside.remove();
	});
});
