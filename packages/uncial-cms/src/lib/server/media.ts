import { createHash } from 'node:crypto';
import type { S3Client } from '@aws-sdk/client-s3';
import type { Row, Sql } from 'postgres';
import { MediaInUseError, NotFoundError } from '../errors.js';
import { GLOBAL_KIND } from '../globals.js';
import type { ContentStore } from './postgres-store.js';

export interface MediaItem {
	id: string;
	key: string;
	url: string;
	filename: string;
	title: string;
	contentType: string;
	width: number | null;
	height: number | null;
	size: number;
	uploadedBy: string;
	uploadedAt: Date;
}

export interface MediaS3Options {
	endpoint: string;
	region: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
	forcePathStyle: boolean;
}

export interface MediaLibraryOptions {
	sql: Sql;
	s3: MediaS3Options;
	publicBaseUrl: string;
	store: ContentStore;
}

export interface MediaLibrary {
	list(
		query?: { search?: string; contentType?: string }
	): Promise<Array<MediaItem & { usage: number; usagePaths: string[] }>>;
	upload(
		bytes: Uint8Array,
		meta: { filename: string; title?: string; contentType: string; uploadedBy: string }
	): Promise<MediaItem>;
	usage(id: string): Promise<{ count: number; paths: string[] }>;
	delete(id: string): Promise<void>;
}

const EXTENSIONS: Record<string, string> = {
	'image/webp': 'webp',
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
	'image/avif': 'avif',
	'image/svg+xml': 'svg',
	'application/pdf': 'pdf',
	'video/mp4': 'mp4'
};

function extension(contentType: string, filename: string): string {
	return EXTENSIONS[contentType] ?? /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase() ?? 'bin';
}

/** Reads width and height from a PNG, GIF, WebP or JPEG header; null for anything else. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
	if (bytes.length >= 24 && ascii(1, 4) === 'PNG') {
		return { width: view.getUint32(16), height: view.getUint32(20) };
	}
	if (bytes.length >= 10 && ascii(0, 3) === 'GIF') {
		return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
	}
	if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
		const chunk = ascii(12, 16);
		if (chunk === 'VP8X') {
			const u24 = (at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
			return { width: u24(24) + 1, height: u24(27) + 1 };
		}
		if (chunk === 'VP8 ') {
			return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
		}
		if (chunk === 'VP8L') {
			const bits = view.getUint32(21, true);
			return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
		}
	}
	if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
		let at = 2;
		while (at + 9 < bytes.length) {
			if (bytes[at] !== 0xff) return null;
			const marker = bytes[at + 1];
			const length = view.getUint16(at + 2);
			// SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC).
			if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
				return { width: view.getUint16(at + 7), height: view.getUint16(at + 5) };
			}
			at += 2 + length;
		}
	}
	return null;
}

function toItem(row: Row, publicBaseUrl: string): MediaItem {
	return {
		id: row.id,
		key: row.key,
		url: `${publicBaseUrl}/${row.key}`,
		filename: row.filename,
		title: row.title,
		contentType: row.content_type,
		width: row.width,
		height: row.height,
		size: row.size,
		uploadedBy: row.uploaded_by,
		uploadedAt: row.uploaded_at
	};
}

/**
 * Content-addressed, immutable Media items in S3-compatible storage, with
 * their metadata in Postgres. Usage counts references to an item's URL in
 * Published copies and Drafts; Versions never count.
 */
export function createMediaLibrary(opts: MediaLibraryOptions): MediaLibrary {
	const { sql, store } = opts;
	const publicBaseUrl = opts.publicBaseUrl.replace(/\/+$/, '');
	const { bucket } = opts.s3;

	// Loaded on first use, so a host using only the ContentStore needs no S3 SDK.
	let s3: Promise<{ client: S3Client; sdk: typeof import('@aws-sdk/client-s3') }> | undefined;
	const connect = () =>
		(s3 ??= import('@aws-sdk/client-s3').then((sdk) => ({
			sdk,
			client: new sdk.S3Client({
				endpoint: opts.s3.endpoint,
				region: opts.s3.region,
				forcePathStyle: opts.s3.forcePathStyle,
				credentials: {
					accessKeyId: opts.s3.accessKeyId,
					secretAccessKey: opts.s3.secretAccessKey
				}
			})
		})));

	async function referencing(urls: string[]): Promise<Map<string, string[]>> {
		const records = (await Promise.all([store.list(), store.list({ kind: GLOBAL_KIND })])).flat();
		const paths = new Map(urls.map((url) => [url, [] as string[]]));
		for (const record of records) {
			const docs = [record.draft, record.published]
				.filter((doc) => doc !== null)
				.map((doc) => JSON.stringify(doc));
			for (const url of urls) {
				if (docs.some((doc) => doc.includes(url))) paths.get(url)!.push(record.path);
			}
		}
		return paths;
	}

	async function find(id: string): Promise<MediaItem> {
		const [row] = await sql`select * from uncial_media where id = ${id}`;
		if (!row) throw new NotFoundError(`No Media item ${id}.`);
		return toItem(row, publicBaseUrl);
	}

	async function usage(id: string) {
		const item = await find(id);
		const paths = (await referencing([item.url])).get(item.url)!;
		return { count: paths.length, paths };
	}

	return {
		async list({ search, contentType } = {}) {
			const pattern = search ? `%${search.replace(/[\\%_]/g, '\\$&')}%` : undefined;
			const rows = await sql`
				select * from uncial_media
				where true
					${pattern === undefined ? sql`` : sql`and (title ilike ${pattern} or filename ilike ${pattern})`}
					${contentType === undefined ? sql`` : sql`and content_type like ${contentType.replace('*', '%')}`}
				order by uploaded_at desc, id
			`;
			const items = rows.map((row) => toItem(row, publicBaseUrl));
			const paths = await referencing(items.map((item) => item.url));
			return items.map((item) => {
				const usagePaths = paths.get(item.url)!;
				return { ...item, usage: usagePaths.length, usagePaths };
			});
		},

		async upload(bytes, { filename, title, contentType, uploadedBy }) {
			const id = createHash('sha256').update(bytes).digest('hex');
			const [existing] = await sql`select * from uncial_media where id = ${id}`;
			if (existing) return toItem(existing, publicBaseUrl);

			const key = `${id}.${extension(contentType, filename)}`;
			const { client, sdk } = await connect();
			await client.send(
				new sdk.PutObjectCommand({
					Bucket: bucket,
					Key: key,
					Body: bytes,
					ContentType: contentType,
					CacheControl: 'public, max-age=31536000, immutable',
					ACL: 'public-read'
				})
			);
			const size = imageSize(bytes);
			const [row] = await sql`
				insert into uncial_media
					(id, key, filename, title, content_type, width, height, size, uploaded_by)
				values (
					${id}, ${key}, ${filename}, ${title || filename.replace(/\.[^.]+$/, '')},
					${contentType}, ${size?.width ?? null}, ${size?.height ?? null},
					${bytes.byteLength}, ${uploadedBy}
				)
				on conflict (id) do update set id = excluded.id
				returning *
			`;
			return toItem(row, publicBaseUrl);
		},

		usage,

		async delete(id) {
			const item = await find(id);
			const current = await usage(id);
			if (current.count > 0) throw new MediaInUseError(current);
			const { client, sdk } = await connect();
			await client.send(new sdk.DeleteObjectCommand({ Bucket: bucket, Key: item.key }));
			await sql`delete from uncial_media where id = ${id}`;
		}
	};
}
