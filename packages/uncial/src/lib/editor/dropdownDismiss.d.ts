import type { ActionReturn } from 'svelte/action';
/**
 * Makes a native `<details>` dropdown dismissable by keyboard and by
 * interacting outside it. The browser only closes a `<details>` when its own
 * summary is toggled; this action adds:
 *
 * - **Escape** closes the open menu and returns focus to the summary.
 * - A **pointer press or focus move outside** the element closes the menu
 *   (without stealing focus), matching the expected menu-dismissal behaviour.
 *
 * Listeners on `document` use the capture phase so the menu closes even when
 * the outside target stops propagation. "Inside" is decided with
 * `composedPath()` rather than `event.target` so it stays correct when the
 * editor is mounted in a shadow root (e.g. the `<uncial-editor>` custom
 * element), where `event.target` retargets to the shadow host and would make
 * every in-menu interaction look like an outside click.
 */
export declare function dropdownDismiss(node: HTMLDetailsElement): ActionReturn;
