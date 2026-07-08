import { imagesListUrl } from './apiUrls.js';
import type { UncialApiUrls } from './apiUrls.js';

export type WagtailImage = {
	id: number;
	title: string;
	previewUrl?: string;
	width?: number;
	height?: number;
};

export type ChooseAttributeEvent = CustomEvent<{
	inputKind: string;
	name: string;
	attrs: Record<string, unknown>;
	setAttrs: (attrs: Record<string, unknown>) => void;
}>;

export async function fetchImages(apiUrls?: UncialApiUrls): Promise<WagtailImage[]> {
	const response = await fetch(imagesListUrl(apiUrls));
	if (!response.ok) return [];
	const payload = (await response.json()) as { images?: WagtailImage[] };
	return payload.images ?? [];
}

/**
 * Write a chosen image back to the block's attributes. Shared by the Wagtail
 * modal bridge path and the fallback dialog so both apply identical attrs.
 */
export function applyImageChoice(event: ChooseAttributeEvent, chosen: WagtailImage): void {
	event.detail.setAttrs({
		[event.detail.name]: chosen.id,
		previewUrl: chosen.previewUrl ?? '',
		alt: event.detail.attrs.alt || chosen.title
	});
}

export function closeImageBrowser(dialog: HTMLDialogElement) {
	dialog.close();
	dialog.remove();
}

export function createImageButton(image: WagtailImage, onChoose: (image: WagtailImage) => void) {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'uncial-wagtail-image-choice';

	if (image.previewUrl) {
		const preview = document.createElement('img');
		preview.setAttribute('src', image.previewUrl);
		preview.setAttribute('alt', '');
		button.append(preview);
	} else {
		const placeholder = document.createElement('span');
		placeholder.textContent = 'No preview';
		button.append(placeholder);
	}

	const title = document.createElement('strong');
	title.textContent = image.title;
	button.append(title);

	const meta = document.createElement('small');
	meta.textContent = `#${image.id}${image.width && image.height ? ` · ${image.width}x${image.height}` : ''}`;
	button.append(meta);

	button.addEventListener('click', () => onChoose(image));
	return button;
}

export async function openImageBrowser(event: ChooseAttributeEvent, apiUrls?: UncialApiUrls) {
	const dialog = document.createElement('dialog');
	dialog.className = 'uncial-wagtail-image-browser';
	dialog.innerHTML = `
		<form method="dialog" class="uncial-wagtail-image-browser__header">
			<h2>Choose Wagtail image</h2>
			<button type="button" data-close>Close</button>
		</form>
		<div class="uncial-wagtail-image-browser__grid">Loading images...</div>
	`;
	document.body.append(dialog);
	dialog.querySelector('[data-close]')?.addEventListener('click', () => closeImageBrowser(dialog));
	dialog.showModal();

	const grid = dialog.querySelector('.uncial-wagtail-image-browser__grid');
	const images = await fetchImages(apiUrls);
	if (!grid) return;
	grid.replaceChildren();

	if (images.length === 0) {
		grid.textContent = 'No Wagtail images are available. Upload one in Images first.';
		return;
	}

	for (const image of images) {
		grid.append(
			createImageButton(image, (chosen) => {
				applyImageChoice(event, chosen);
				closeImageBrowser(dialog);
			})
		);
	}
}
