import type { ActionReturn } from 'svelte/action';

/** Breathing room between the menu and the viewport edge it is clamped to. */
const VIEWPORT_MARGIN = 8;

/** The vertical padding and border `max-height` does not account for. */
function frameHeight(element: HTMLElement): number {
	const style = getComputedStyle(element);
	if (style.boxSizing === 'border-box') return 0;
	return (
		Number.parseFloat(style.borderTopWidth) +
		Number.parseFloat(style.borderBottomWidth) +
		Number.parseFloat(style.paddingTop) +
		Number.parseFloat(style.paddingBottom)
	);
}

/**
 * Lifts an open `<details>` dropdown's menu out of every scrolling ancestor and
 * places it against the viewport, under (or over) its own summary.
 *
 * The attributes sidebar's panel is `position: sticky` with a `max-height` and
 * `overflow-y: auto`, which clips an absolutely positioned menu at the panel's
 * edge — so the "Add block" list was unreachable by mouse. A viewport-positioned
 * menu is not clipped by an overflow ancestor, and the top layer (`popover`,
 * where the browser has it) also lifts it clear of a transformed ancestor, which
 * a `position: fixed` element alone would still be trapped inside.
 *
 * Positioning only. Dismissal stays with `dropdownDismiss`, which the menu's
 * unchanged place in the DOM tree keeps working.
 */
export function dropdownFloat(node: HTMLDetailsElement): ActionReturn {
	let gap: number | null = null;

	function parts(): { summary: HTMLElement; menu: HTMLElement } | null {
		const summary = node.querySelector<HTMLElement>('summary');
		const menu = node.querySelector<HTMLElement>('.uncial-dropdown__menu');
		return summary && menu ? { summary, menu } : null;
	}

	function place(): void {
		const found = parts();
		if (!found) return;
		const { summary, menu } = found;

		// The stylesheet's `margin-top` is the trigger-to-menu gap; it has to be
		// read before the first placement zeroes it.
		if (gap === null) gap = Number.parseFloat(getComputedStyle(menu).marginTop) || 0;

		if (menu.popover !== 'manual' && 'popover' in menu) menu.popover = 'manual';
		if (menu.popover && !menu.matches(':popover-open')) menu.showPopover();

		// Lifting the height cap to measure resets the menu's own scroll, so a
		// re-place must not lose how far the reader had scrolled the list.
		const scrolled = menu.scrollTop;
		menu.style.position = 'fixed';
		menu.style.margin = '0';
		menu.style.right = 'auto';
		menu.style.bottom = 'auto';
		menu.style.maxHeight = '';
		menu.style.overflowY = '';
		menu.style.top = '0px';
		menu.style.left = '0px';

		const anchor = summary.getBoundingClientRect();
		const natural = menu.getBoundingClientRect();
		const spaceBelow = window.innerHeight - anchor.bottom - gap - VIEWPORT_MARGIN;
		const spaceAbove = anchor.top - gap - VIEWPORT_MARGIN;
		const below = natural.height <= spaceBelow || spaceBelow >= spaceAbove;
		const available = Math.max(below ? spaceBelow : spaceAbove, 0);

		if (natural.height > available) {
			// Under `content-box` sizing — the default, and the package's stylesheet
			// sets none — `max-height` bounds the content alone, so the menu's own
			// frame has to come out of the space asked for.
			menu.style.maxHeight = `${Math.max(available - frameHeight(menu), 0)}px`;
			menu.style.overflowY = 'auto';
		}
		menu.scrollTop = scrolled;

		const height = menu.getBoundingClientRect().height;
		const top = below ? anchor.bottom + gap : anchor.top - gap - height;
		// `--end` dropdowns hang their right edge off the trigger's right edge.
		const preferredLeft = node.classList.contains('uncial-dropdown--end')
			? anchor.right - natural.width
			: anchor.left;
		const left = Math.max(
			VIEWPORT_MARGIN,
			Math.min(preferredLeft, window.innerWidth - natural.width - VIEWPORT_MARGIN)
		);

		menu.style.top = `${Math.max(top, VIEWPORT_MARGIN)}px`;
		menu.style.left = `${left}px`;
	}

	function release(): void {
		const found = parts();
		if (!found) return;
		const { menu } = found;
		if (menu.popover && menu.matches(':popover-open')) menu.hidePopover();
		for (const property of [
			'position',
			'margin',
			'top',
			'left',
			'right',
			'bottom',
			'max-height',
			'overflow-y'
		]) {
			menu.style.removeProperty(property);
		}
	}

	function onToggle(): void {
		if (node.open) {
			place();
			// Capture, so a scroll in any ancestor — the panel or the page — moves
			// the menu with its trigger.
			document.addEventListener('scroll', place, true);
			window.addEventListener('resize', place);
		} else {
			release();
			document.removeEventListener('scroll', place, true);
			window.removeEventListener('resize', place);
		}
	}

	node.addEventListener('toggle', onToggle);
	if (node.open) onToggle();

	return {
		destroy() {
			node.removeEventListener('toggle', onToggle);
			document.removeEventListener('scroll', place, true);
			window.removeEventListener('resize', place);
			release();
		}
	};
}
