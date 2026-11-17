import type { FileSource, ImageSource } from 'uncial/editor';
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
			list ??
			(async () => (await source().list({ contentType: 'image/*' })).map((item) => item.url)),
		thumbnail
	};
}

/**
 * Documents for `input: 'file'` fields and rich-text links: an upload commits
 * the file under `mediaDir` at a content-addressed name, and Choose existing
 * lists the media that are not images.
 */
export function cmsFileSource(
	config: UncialCmsSiteConfig,
	options: { base?: string; staticDir?: string } = {}
): FileSource {
	const { base = '', staticDir = 'static' } = options;
	const href = (src: string) => resolveImageSrc(src, base);
	if (config.forge === 'server' && !config.mediaApiBase) return { href };
	const source = (): MediaSource => {
		if (config.forge === 'server') return mediaSourceFor(config);
		const forge = getActiveForge();
		if (!forge) {
			throw new Error(
				'No active editor session — open a page in the editor and sign in before choosing or uploading a file.'
			);
		}
		return mediaSourceFor(config, forge, { staticDir });
	};
	return {
		upload: async (file) => {
			const item = await source().upload(file);
			return {
				src: item.url,
				name: file.name,
				size: file.size,
				type: file.type || item.contentType
			};
		},
		browse: async () =>
			(await source().list())
				.filter((item) => !item.contentType.startsWith('image/'))
				.map((item) => ({
					src: item.url,
					name: item.title || item.filename,
					size: item.size ?? 0,
					type: item.contentType
				})),
		href
	};
}
