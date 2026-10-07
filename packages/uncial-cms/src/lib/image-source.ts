import type { ImageSource } from 'uncial/editor';
import { resolveImageSrc } from 'uncial/render';
import { mediaSourceFor, type MediaSource } from './media-source.js';
import type { UncialCmsSiteConfig } from './types.js';
import { getActiveForge } from './upload-context.js';

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
	if (config.forge === 'server' && !config.mediaApiBase) return { thumbnail };
	const source = (): MediaSource => {
		if (config.forge === 'server') return mediaSourceFor(config);
		const forge = getActiveForge();
		if (!forge) {
			throw new Error(
				'No active editor session — open a page in the editor and sign in before choosing or uploading an image.'
			);
		}
		return mediaSourceFor(config, forge, { staticDir });
	};
	return {
		upload: async (file) => (await source().upload(file)).url,
		browse:
			list ?? (async () => (await source().list({ contentType: 'image/*' })).map((item) => item.url)),
		thumbnail
	};
}
