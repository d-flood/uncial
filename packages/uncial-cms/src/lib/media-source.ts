import { fitImage } from './fit-image.js';
import { uploadAsset } from './index-actions.js';
import { servedUrl } from './served-url.js';
import { deleteMedia, listMedia, uploadMedia } from './server-forge/media.js';
import type { Action, MediaItemView } from './server-forge/protocol.js';
import type { ForgeAdapter, UncialCmsSiteConfig } from './types.js';
import { configMediaDir } from './upload-context.js';

export interface MediaSource {
	capabilities: { metadata: boolean; usage: boolean; delete: boolean; search: boolean };
	list(query?: { search?: string; contentType?: string }): Promise<MediaItem[]>;
	upload(file: File, opts?: { title?: string }): Promise<MediaItem>;
	delete(item: MediaItem): Promise<void>;
}

export interface MediaItem {
	id: string;
	/** What a Content document stores as `src`: base-less on git forges. */
	url: string;
	filename: string;
	contentType: string;
	size?: number;
	width?: number;
	height?: number;
	title?: string;
	uploadedAt?: string;
	uploadedBy?: string;
	usage?: Array<{ path: string; title?: string }>;
}

const CONTENT_TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif',
	svg: 'image/svg+xml'
};

function matchesType(contentType: string, pattern?: string): boolean {
	if (!pattern) return true;
	return pattern.endsWith('/*')
		? contentType.startsWith(pattern.slice(0, -1))
		: contentType === pattern;
}

function gitMediaSource(opts: {
	adapter: ForgeAdapter;
	author: { name: string; email: string };
	config: UncialCmsSiteConfig;
	mediaDir: string;
	staticDir: string;
}): MediaSource {
	const { adapter, author, config, mediaDir, staticDir } = opts;

	const item = (path: string): MediaItem => {
		const filename = path.slice(path.lastIndexOf('/') + 1);
		const extension = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
		return {
			id: path,
			url: servedUrl({ config }, path, staticDir),
			filename,
			contentType: CONTENT_TYPES[extension] ?? 'application/octet-stream'
		};
	};

	return {
		capabilities: { metadata: false, usage: false, delete: true, search: false },

		async list({ contentType } = {}) {
			const entries = await adapter.listDir(mediaDir);
			return entries
				.filter((entry) => entry.type === 'file')
				.map((entry) => entry.path)
				.sort()
				.map(item)
				.filter((media) => matchesType(media.contentType, contentType));
		},

		async upload(file) {
			const raster = file.type.startsWith('image/') && file.type !== 'image/svg+xml';
			const asset = raster
				? await fitImage(file)
				: {
						bytes: new Uint8Array(await file.arrayBuffer()),
						filename: file.name,
						contentType: file.type || 'application/octet-stream'
					};
			const { path } = await uploadAsset({ adapter }, asset, { mediaDir, author });
			return item(path);
		},

		async delete(media) {
			// The forge deletes at a blob sha, which a listing does not carry.
			const { sha } = await adapter.readFile(media.id);
			await adapter.deleteFile(media.id, { message: `uncial-cms: delete ${media.id}`, sha });
		}
	};
}

function fromView(item: MediaItemView): MediaItem {
	return {
		id: item.id,
		url: item.url,
		filename: item.filename,
		contentType: item.contentType,
		size: item.size,
		width: item.width ?? undefined,
		height: item.height ?? undefined,
		title: item.title,
		uploadedAt: item.uploadedAt,
		uploadedBy: item.uploadedBy
	};
}

export function serverMediaSource(
	apiBase: string,
	onAllowed?: (allowed: Action[]) => void
): MediaSource {
	return {
		capabilities: { metadata: true, usage: true, delete: true, search: true },

		async list(query) {
			const view = await listMedia(apiBase, query);
			onAllowed?.(view.allowed);
			return view.items.map((item) => ({
				...fromView(item),
				usage: item.usagePaths.map((path) => ({ path }))
			}));
		},

		upload: async (file, opts) => fromView(await uploadMedia(apiBase, file, opts)),

		delete: (item) => deleteMedia(apiBase, item.id)
	};
}

export function mediaSourceFor(
	config: UncialCmsSiteConfig,
	session?: { adapter: ForgeAdapter; author: { name: string; email: string } },
	opts: { staticDir?: string } = {}
): MediaSource {
	if (config.forge === 'server') {
		if (!config.mediaApiBase) {
			throw new Error('This server site sets no `mediaApiBase`, so it has no Media library.');
		}
		return serverMediaSource(config.mediaApiBase);
	}
	if (!session) {
		throw new Error('A git forge reaches its media through a signed-in editing session.');
	}
	const mediaDir = configMediaDir(config);
	if (!mediaDir) throw new Error('No media directory: set `mediaDir` in the site config.');
	return gitMediaSource({
		adapter: session.adapter,
		author: session.author,
		config,
		mediaDir,
		staticDir: opts.staticDir ?? 'static'
	});
}
