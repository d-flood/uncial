import type { FileSource, ImageSource } from 'uncial/editor';
import { resolveImageSrc } from 'uncial';
import type { MediaSource } from './media-source.js';
import type { UncialCmsSiteConfig } from './types.js';
import { getActiveForge } from './upload-context.js';

async function mediaSource(
	config: UncialCmsSiteConfig,
	staticDir: string,
	what: string
): Promise<MediaSource> {
	const { mediaSourceFor } = await import('./media-source.js');
	if (config.forge === 'server') return mediaSourceFor(config);
	const forge = getActiveForge();
	if (!forge) {
		throw new Error(
			`No active editor session — open a page in the editor and sign in before choosing or uploading ${what}.`
		);
	}
	return mediaSourceFor(config, forge, { staticDir });
}

export function cmsImageSource(
	config: UncialCmsSiteConfig,
	options: { base?: string; staticDir?: string } = {}
): ImageSource {
	const { base = '', staticDir = 'static' } = options;
	const thumbnail = (src: string) => resolveImageSrc(src, base);
	if (config.forge === 'server' && !config.mediaApiBase) return { thumbnail };
	const source = () => mediaSource(config, staticDir, 'an image');
	return {
		upload: async (file) => (await (await source()).upload(file)).url,
		browse: async () =>
			(await (await source()).list({ contentType: 'image/*' })).map((item) => item.url),
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
	const source = () => mediaSource(config, staticDir, 'a file');
	return {
		upload: async (file) => {
			const item = await (await source()).upload(file);
			return {
				src: item.url,
				name: file.name,
				size: file.size,
				type: file.type || item.contentType
			};
		},
		browse: async () =>
			(await (await source()).list())
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
