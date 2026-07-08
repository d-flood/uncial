import { imagesListUrl } from './apiUrls.js';
import type { UncialApiUrls } from './apiUrls.js';
import { applyImageChoice, openImageBrowser } from './imageBrowser.js';
import type { ChooseAttributeEvent } from './imageBrowser.js';
import { getUncialWagtailGlobal } from './uncialGlobal.js';
import type {
	WagtailChooseImage,
	WagtailChooserCancelled,
	WagtailChooserOutcome,
	WagtailImageChooserResult
} from './uncialGlobal.js';

export type {
	WagtailChooseImage,
	WagtailChooserCancelled,
	WagtailChooserOutcome,
	WagtailImageChooserResult
} from './uncialGlobal.js';

/**
 * Synchronously detect the Wagtail ModalWorkflow bridge installed by
 * chooser-bridge.js. Returns the bridge function or `undefined` when no
 * bridge is present on the page.
 */
export function getChooserBridge(): WagtailChooseImage | undefined {
	const chooseImage = getUncialWagtailGlobal()?.chooseImage;
	return typeof chooseImage === 'function' ? chooseImage : undefined;
}

export function isChooserCancelled(
	outcome: WagtailChooserOutcome
): outcome is WagtailChooserCancelled {
	return outcome !== null && 'cancelled' in outcome && outcome.cancelled === true;
}

/**
 * Open the Wagtail chooser through the bridge. Resolves `null` when no bridge
 * is available (same signal the bridge uses when it cannot open the modal).
 * The promise is awaited without any timeout: choosing can take as long as
 * the user needs.
 */
export async function chooseWagtailImage(
	selectedId?: number | null
): Promise<WagtailChooserOutcome> {
	const bridge = getChooserBridge();
	if (!bridge) return null;
	return bridge({ selectedId: selectedId ?? null });
}

export async function getWagtailImagePreview(
	imageId: number,
	apiUrls?: UncialApiUrls
): Promise<WagtailImageChooserResult | null> {
	const listUrl = imagesListUrl(apiUrls);
	const separator = listUrl.includes('?') ? '&' : '?';
	const response = await fetch(`${listUrl}${separator}id=${encodeURIComponent(String(imageId))}`);
	if (!response.ok) return null;
	const payload = (await response.json()) as { images?: WagtailImageChooserResult[] };
	return payload.images?.[0] ?? null;
}

function currentImageId(event: ChooseAttributeEvent): number | null {
	const value = Number(event.detail.attrs[event.detail.name]);
	return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Single entry point for every "choose a Wagtail image" interaction
 * (`uncial:choose-attribute` events with the `wagtail-image` input kind).
 *
 * The real Wagtail chooser modal (bridge) is the primary path. The bespoke
 * `<dialog>` browser only opens when no bridge exists or the bridge reports
 * it could not open the modal at all (`null`). A user cancelling the open
 * modal resolves `{ cancelled: true }` and changes nothing.
 */
export async function chooseImageForAttribute(
	event: ChooseAttributeEvent,
	apiUrls?: UncialApiUrls
): Promise<void> {
	const bridge = getChooserBridge();
	if (!bridge) {
		await openImageBrowser(event, apiUrls);
		return;
	}

	const outcome = await bridge({ selectedId: currentImageId(event) });
	if (outcome === null) {
		// The bridge could not open the Wagtail modal (ModalWorkflow missing).
		await openImageBrowser(event, apiUrls);
		return;
	}
	if (isChooserCancelled(outcome)) return;

	applyImageChoice(event, outcome);
}
