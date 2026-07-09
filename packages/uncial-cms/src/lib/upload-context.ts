/**
 * The active editor's forge, exposed so a block's in-editor UI (e.g. the Image
 * block's Upload affordance) can reach the same authenticated adapter + author
 * `mountEditorPage` uses — without threading them through the editor web
 * component and every block's props.
 *
 * It is a single last-writer-wins slot: one page hosts one editor at a time.
 * `createEditorController` sets it once the session is established;
 * `mountEditorPage` clears it on teardown. A block reads it through
 * {@link uploadImageAsset}, never directly.
 */
import type { ForgeAdapter } from './types.js';

export interface ActiveForge {
	adapter: ForgeAdapter;
	author: { name: string; email: string };
}

let active: ActiveForge | null = null;

export function setActiveForge(forge: ActiveForge): void {
	active = forge;
}

export function clearActiveForge(): void {
	active = null;
}

export function getActiveForge(): ActiveForge | null {
	return active;
}
