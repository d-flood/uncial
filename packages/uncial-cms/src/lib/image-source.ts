import type { ImageSource } from 'uncial/editor';
import { resolveImageSrc } from 'uncial/render';
import { uploadImageAsset } from './index-actions.js';
import { servedUrl } from './served-url.js';
import type { UncialCmsSiteConfig } from './types.js';

/**
 * The editor's image source for a CMS site: an upload is fitted under the
 * forge limit, committed under the media dir through the active editor
 * session, and stored as its base-less served URL. `base` and `staticDir` are
 * the site's build-time values, which the config does not carry.
 */
export function cmsImageSource(
	config: UncialCmsSiteConfig,
	options: { base?: string; staticDir?: string } = {}
): ImageSource {
	const { base = '', staticDir = 'static' } = options;
	return {
		upload: async (file) => {
			const result = await uploadImageAsset(file, { fit: true, mediaDir: config.mediaDir });
			return servedUrl({ config }, result.path, staticDir);
		},
		thumbnail: (src) => resolveImageSrc(src, base)
	};
}
