import type { ImageSource } from 'uncial/editor';
import { resolveImageSrc } from 'uncial/render';
import { resolveMediaDir, uploadImageAsset } from './index-actions.js';
import { servedUrl } from './served-url.js';
import { listMedia, uploadMedia } from './server-forge/media.js';
import type { UncialCmsSiteConfig } from './types.js';
import { configMediaDir, getActiveForge } from './upload-context.js';

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

/**
 * The editor's image source for a CMS site: an upload is fitted under the
 * forge limit, committed under the media dir through the active editor
 * session, and stored as its base-less served URL; browse lists the media
 * dir's images the same way. `base` and `staticDir` are the site's build-time
 * values, which the config does not carry. A site with a rendition pipeline
 * replaces the listing with `list` (served paths) and the tile URL with
 * `thumbnail`. On a `server` forge, upload and browse go to the Media
 * library at `mediaApiBase` instead.
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
	const thumbnail = options.thumbnail ?? ((src: string) => resolveImageSrc(src, base));
	if (config.forge === 'server') {
		const { mediaApiBase } = config;
		if (!mediaApiBase) return { thumbnail };
		return {
			upload: async (file) => (await uploadMedia(mediaApiBase, file)).url,
			browse:
				list ??
				(async () =>
					(await listMedia(mediaApiBase, { contentType: 'image/*' })).items.map((item) => item.url)),
			thumbnail
		};
	}
	return {
		upload: async (file) => {
			const result = await uploadImageAsset(file, { fit: true, mediaDir: configMediaDir(config) });
			return servedUrl({ config }, result.path, staticDir);
		},
		browse: list ?? (async () => {
			const forge = getActiveForge();
			if (!forge) {
				throw new Error(
					'No active editor session — open a page in the editor and sign in before choosing an image.'
				);
			}
			// The same resolution `uploadImageAsset` commits under, so browse lists what upload wrote.
			const mediaDir = resolveMediaDir(configMediaDir(config), configMediaDir(forge.config));
			const entries = await forge.adapter.listDir(mediaDir);
			return entries
				.filter((entry) => entry.type === 'file' && IMAGE_EXTENSION.test(entry.path))
				.map((entry) => entry.path)
				.sort()
				.map((path) => servedUrl({ config }, path, staticDir));
		}),
		thumbnail
	};
}
