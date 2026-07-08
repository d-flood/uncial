import type { Editor } from '@tiptap/core';
import { get, type Writable } from 'svelte/store';
import { sanitizeHref } from '../render/sanitize.js';
import type { BlockAttributesState, LinkAttributes } from './attributesController.js';

/** The link mark's attributes for the current selection, or null if none is active. */
export function getActiveLinkAttrs(editor: Editor | null): LinkAttributes | null {
	if (!editor?.isActive('link')) return null;
	return editor.getAttributes('link') as LinkAttributes;
}

export interface LinkController {
	open(): void;
	close(): void;
	setAttr(name: keyof LinkAttributes, value: string | null): void;
	commit(): boolean;
	remove(): boolean;
}

/**
 * Owns the `link` slice of the shared attributes state. It reads the editor
 * lazily via `getEditor` (the controller's editor reference changes on
 * attach/detach) and mutates only `state.link`, leaving the rest of the
 * snapshot untouched.
 */
export function createLinkController(
	getEditor: () => Editor | null,
	state: Writable<BlockAttributesState>
): LinkController {
	function close(): void {
		state.update((current) => ({ ...current, link: { open: false, attrs: {} } }));
	}

	return {
		open() {
			const editor = getEditor();
			if (!editor) return;
			const attrs = getActiveLinkAttrs(editor) ?? { href: '' };
			state.update((current) => ({ ...current, link: { open: true, attrs } }));
		},
		close,
		setAttr(name, value) {
			state.update((current) => ({
				...current,
				link: {
					open: true,
					attrs: {
						...current.link.attrs,
						[name]: value
					}
				}
			}));
		},
		commit() {
			const editor = getEditor();
			if (!editor) return false;
			const attrs = get(state).link.attrs;
			const href = sanitizeHref(attrs.href);
			if (!href) return false;

			return editor
				.chain()
				.focus()
				.extendMarkRange('link')
				.setMark('link', {
					...attrs,
					href,
					target: attrs.target || null,
					rel: attrs.rel || null,
					title: attrs.title?.trim() || null,
					class: attrs.class?.trim() || null
				})
				.run();
		},
		remove() {
			const editor = getEditor();
			if (!editor) return false;
			const ok = editor.chain().focus().extendMarkRange('link').unsetLink().run();
			if (ok) close();
			return ok;
		}
	};
}
