/**
 * API endpoint configuration for the admin frontend.
 *
 * URLs are reversed server-side (see `UncialEditorConfig.as_dict()["apiUrls"]`)
 * and injected through the widget's `data-uncial-config` JSON. When the config
 * is absent (older server, component mounted outside the admin) every helper
 * falls back to the historical hardcoded `/api/uncial/images/` paths.
 */
export interface UncialApiUrls {
	/** Reversed image list endpoint (`image_chooser_fallback`). */
	images?: string;
	/** Reversed preview URL for image id 0; `/0/` is substituted with the real id. */
	imagePreview?: string;
	/** Wagtail admin image chooser modal URL ('' / absent when unavailable). */
	chooserModal?: string;
}

export const FALLBACK_IMAGES_URL = '/api/uncial/images/';

const PREVIEW_ID_MARKER = '/0/';

let activeApiUrls: UncialApiUrls = {};

/** Record the widget config's apiUrls as the module-wide default. */
export function setActiveApiUrls(apiUrls: UncialApiUrls | undefined): void {
	activeApiUrls = apiUrls ?? {};
}

export function getActiveApiUrls(): UncialApiUrls {
	return activeApiUrls;
}

/** URL of the image list endpoint used by the fallback browser dialog. */
export function imagesListUrl(apiUrls: UncialApiUrls = activeApiUrls): string {
	return apiUrls.images || FALLBACK_IMAGES_URL;
}

/**
 * URL redirecting to a rendition of the given image, built by substituting the
 * id into the reversed template (which was generated for id 0). The id sits at
 * the parameter position near the end of the URL, so the last `/0/` segment is
 * replaced; templates without the marker fall back to the hardcoded path.
 */
export function imagePreviewUrl(imageId: number, apiUrls: UncialApiUrls = activeApiUrls): string {
	const template = apiUrls.imagePreview;
	if (template) {
		const markerIndex = template.lastIndexOf(PREVIEW_ID_MARKER);
		if (markerIndex !== -1) {
			return (
				template.slice(0, markerIndex) +
				`/${imageId}/` +
				template.slice(markerIndex + PREVIEW_ID_MARKER.length)
			);
		}
	}
	return `${FALLBACK_IMAGES_URL}${imageId}/preview/`;
}
