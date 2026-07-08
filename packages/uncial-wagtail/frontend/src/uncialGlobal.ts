import type { BlockDefinition } from 'uncial/core';
import type { ToolbarFeature } from 'uncial/editor';

/** An image picked through the Wagtail chooser (bridge or fallback dialog). */
export interface WagtailImageChooserResult {
	id: number;
	title: string;
	previewUrl?: string;
	width?: number;
	height?: number;
}

/** Resolved by the bridge when the user dismissed the open modal without choosing. */
export interface WagtailChooserCancelled {
	cancelled: true;
}

/**
 * Result of a `chooseImage` bridge call:
 * - a {@link WagtailImageChooserResult} when the user chose an image,
 * - `{ cancelled: true }` when the user closed the modal without choosing
 *   (must NOT trigger the fallback dialog),
 * - `null` when the bridge could not open the Wagtail chooser modal at all
 *   (ModalWorkflow / image chooser scripts missing) — the only case where the
 *   fallback `<dialog>` browser should take over.
 */
export type WagtailChooserOutcome =
	| WagtailImageChooserResult
	| WagtailChooserCancelled
	| null;

export type WagtailChooseImage = (options?: {
	selectedId?: number | null;
}) => Promise<WagtailChooserOutcome>;

/**
 * Shared `window.uncialWagtail` global. chooser-bridge.js and consumer
 * registration scripts (e.g. the demo blocks bundle) each merge their keys
 * into the object — nothing may overwrite it wholesale.
 */
export interface UncialWagtailGlobal {
	/** Wagtail ModalWorkflow bridge installed by chooser-bridge.js. */
	chooseImage?: WagtailChooseImage;
	/** Chooser modal URL consumed by chooser-bridge.js; set from widget config. */
	imageChooserUrl?: string;
	/**
	 * Custom block factories registered by consumer scripts before the admin
	 * bundle initializes widgets, keyed by block id (`customBlocks` config keys).
	 */
	customBlocks?: Record<string, (() => BlockDefinition) | undefined>;
	/** Toolbar features keyed by registry key (`toolbarExtensions` config keys). */
	toolbarExtensions?: Record<string, ToolbarFeature | undefined>;
}

declare global {
	interface Window {
		uncialWagtail?: UncialWagtailGlobal;
	}
}

export function getUncialWagtailGlobal(): UncialWagtailGlobal | undefined {
	return typeof window === 'undefined' ? undefined : window.uncialWagtail;
}

/** Merge-friendly accessor: creates the global if needed, never replaces it. */
export function ensureUncialWagtailGlobal(): UncialWagtailGlobal {
	window.uncialWagtail = window.uncialWagtail ?? {};
	return window.uncialWagtail;
}
