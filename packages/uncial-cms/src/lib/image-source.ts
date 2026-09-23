import type { ImageSource } from 'uncial/editor';
import { resolveImageSrc } from 'uncial/render';
import { resolveMediaDir, uploadImageAsset } from './index-actions.js';
import { servedUrl } from './served-url.js';
import type { UncialCmsSiteConfig } from './types.js';
import { getActiveForge } from './upload-context.js';

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

/**
 * The editor's image source for a CMS site: an upload is fitted under the
 * forge limit, committed under the media dir through the active editor
 * session, and stored as its base-less served URL; browse lists the media
 * dir's images the same way. `base` and `staticDir` are the site's build-time
 * values, which the config does not carry. A site with a rendition pipeline
 * replaces the listing with `list` (served paths) and the tile URL with
 * `thumbnail`.
 */
export function cmsImageSource(
	config: UncialCmsSiteConfig,
	options: {
		base?: string;
		staticDir?: string;
		list?: () => Promise<string[]>;
		thumbnail?: (src: string) => string;
	} = {}
): ImageSource {
	const { base = '', staticDir = 'static', list } = options;
	return {
		upload: async (file) => {
			const result = await uploadImageAsset(file, { fit: true, mediaDir: config.mediaDir });
			return servedUrl({ config }, result.path, staticDir);
		},
		browse: list ?? (async () => {
			const forge = getActiveForge();
			if (!forge) {
				throw new Error(
					'No active editor session — open a page in the editor and sign in before uploading.'
				);
			}
			const entries = await forge.adapter.listDir(resolveMediaDir(config.mediaDir));
			return entries
				.filter((entry) => entry.type === 'file' && IMAGE_EXTENSION.test(entry.path))
				.map((entry) => entry.path)
				.sort()
				.map((path) => servedUrl({ config }, path, staticDir));
		}),
		thumbnail: options.thumbnail ?? ((src) => resolveImageSrc(src, base))
	};
}
