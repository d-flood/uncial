import { fitImage } from '../fit-image.js';
import { serverRequest } from './adapter.js';
import type { MediaItemView, MediaListView } from './protocol.js';

/** A Media item's object key is `<sha256>.<ext>`, so its URL ends that way wherever it is served from. */
const MEDIA_URL = /\/[0-9a-f]{64}\.[a-z0-9]+$/;

export function isMediaUrl(src: string): boolean {
	return MEDIA_URL.test(src);
}

export function listMedia(
	apiBase: string,
	query: { search?: string; contentType?: string } = {}
): Promise<MediaListView> {
	const params = Object.fromEntries(Object.entries(query).filter(([, value]) => value));
	return serverRequest(apiBase, 'GET', { query: params });
}

/** Uploads `file`, fitted first when it is a raster image, as Uncial's other forges do. */
export async function uploadMedia(
	apiBase: string,
	file: File,
	opts: { title?: string } = {}
): Promise<MediaItemView> {
	const raster = file.type.startsWith('image/') && file.type !== 'image/svg+xml';
	const fitted = raster ? await fitImage(file) : null;
	const form = new FormData();
	form.set(
		'file',
		fitted
			? new File([fitted.bytes as BlobPart], fitted.filename, { type: fitted.contentType })
			: file
	);
	if (opts.title) form.set('title', opts.title);
	return serverRequest(apiBase, 'POST', { body: form });
}

export function deleteMedia(apiBase: string, id: string): Promise<void> {
	return serverRequest(apiBase, 'DELETE', { body: { id } });
}
