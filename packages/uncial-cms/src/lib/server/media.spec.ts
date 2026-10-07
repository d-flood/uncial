import { randomBytes } from 'node:crypto';
import { CreateBucketCommand, DeleteBucketCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mediaSourceContract } from '../../fixtures/media-source-contract.js';
import { mediaSourceFor } from '../media-source.js';
import {
	contentStoreMigrations,
	createMediaLibrary,
	createPostgresContentStore,
	createServerMediaHandlers,
	MediaInUseError,
	mediaLibraryMigrations,
	type Action,
	type ContentStore,
	type ServerUser
} from './index.js';
import { imageSize } from './media.js';

const databaseUrl = process.env.UNCIAL_TEST_DATABASE_URL;
const endpoint = process.env.UNCIAL_TEST_S3_ENDPOINT;
if (!databaseUrl || !endpoint) {
	process.stderr.write(
		'Media handler suite skipped: UNCIAL_TEST_DATABASE_URL or UNCIAL_TEST_S3_ENDPOINT is unset.\n'
	);
}

const user: ServerUser = { id: 'u1', email: 'ada@example.org', name: 'Ada' };
const author = user.email;

// A 3×2 PNG header is all `imageSize` reads.
const png = (seed: number) => {
	const bytes = new Uint8Array(32);
	bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
	new DataView(bytes.buffer).setUint32(16, 3);
	new DataView(bytes.buffer).setUint32(20, 2);
	bytes[31] = seed;
	return bytes;
};

const docWith = (src: string) => ({
	version: 1,
	meta: { title: 'Has an image' },
	body: { type: 'doc', content: [{ type: 'block', attrs: { name: 'image', attrs: { src } } }] }
});

describe.skipIf(!databaseUrl || !endpoint)('media handlers', () => {
	const schema = `uncial_media_spec_${randomBytes(4).toString('hex')}`;
	const bucket = schema.replaceAll('_', '-');
	const publicBaseUrl = `${endpoint}/${bucket}`;
	const s3Options = {
		endpoint: endpoint!,
		region: 'us-east-1',
		bucket,
		accessKeyId: 'test',
		secretAccessKey: 'test',
		forcePathStyle: true
	};
	const s3 = new S3Client({
		endpoint: s3Options.endpoint,
		region: s3Options.region,
		forcePathStyle: true,
		credentials: { accessKeyId: 'test', secretAccessKey: 'test' }
	});
	let admin: Sql;
	let sql: Sql;
	let store: ContentStore;
	let denied: Action | null;

	const handlers = () =>
		createServerMediaHandlers({
			library: createMediaLibrary({ sql, s3: s3Options, publicBaseUrl, store }),
			authorize: (_user, action) => action !== denied,
			getUser: () => user
		});

	const event = (method: string, init: { query?: string; body?: BodyInit; json?: unknown } = {}) => {
		const url = new URL(`http://site.test/dashboard/api/media${init.query ?? ''}`);
		const body = init.json === undefined ? init.body : JSON.stringify(init.json);
		return { request: new Request(url, { method, body }), url };
	};

	async function upload(bytes: Uint8Array, filename = 'photo.png') {
		const form = new FormData();
		form.set('file', new File([bytes as BlobPart], filename, { type: 'image/png' }));
		return handlers().POST(event('POST', { body: form }));
	}

	async function uploaded(bytes: Uint8Array) {
		return (await (await upload(bytes)).json()) as { id: string; url: string; key: string };
	}

	const remove = (id: string) => handlers().DELETE(event('DELETE', { json: { id } }));

	beforeAll(async () => {
		admin = postgres(databaseUrl!, { onnotice: () => {} });
		await admin.unsafe(`create schema ${schema}`);
		sql = postgres(databaseUrl!, { onnotice: () => {}, connection: { search_path: schema } });
		for (const migration of [...contentStoreMigrations, ...mediaLibraryMigrations]) {
			await sql.unsafe(migration.sql);
		}
		store = createPostgresContentStore(sql, { retention: { keep: 10 } });
		await s3.send(new CreateBucketCommand({ Bucket: bucket }));
	});

	afterAll(async () => {
		await sql?.end();
		await admin?.unsafe(`drop schema if exists ${schema} cascade`);
		await admin?.end();
		await s3.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => {});
	});

	beforeEach(async () => {
		denied = null;
		await sql`truncate uncial_content cascade`;
	});

	it('stores an upload content-addressed with immutable cache headers', async () => {
		const bytes = png(1);
		const response = await upload(bytes);
		expect(response.status).toBe(201);
		const item = await response.json();
		expect(item).toMatchObject({
			key: `${item.id}.png`,
			url: `${publicBaseUrl}/${item.id}.png`,
			filename: 'photo.png',
			title: 'photo',
			contentType: 'image/png',
			width: 3,
			height: 2,
			size: bytes.byteLength,
			uploadedBy: author
		});
		expect(item.id).toMatch(/^[0-9a-f]{64}$/);
		const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: item.key }));
		expect(object.CacheControl).toBe('public, max-age=31536000, immutable');
	});

	it('answers the same id for identical bytes', async () => {
		const first = await uploaded(png(2));
		const second = await uploaded(png(2));
		expect(second.id).toBe(first.id);
		const list = await (await handlers().GET(event('GET'))).json();
		expect(list.items.filter((item: { id: string }) => item.id === first.id)).toHaveLength(1);
	});

	it('refuses to delete an item a Published copy references', async () => {
		const item = await uploaded(png(3));
		const record = await store.create('/about/', 'page', docWith(item.url), { author });
		await store.publish('/about/', { etag: record.etag, author });

		const response = await remove(item.id);
		expect(response.status).toBe(409);
		expect((await response.json()).usage).toEqual({ count: 1, paths: ['/about/'] });
	});

	it('refuses to delete an item a Draft references', async () => {
		const item = await uploaded(png(4));
		await store.create('/draft/', 'page', docWith(item.url), { author });

		expect((await remove(item.id)).status).toBe(409);
		const list = await (await handlers().GET(event('GET'))).json();
		expect(list.items.find((entry: { id: string }) => entry.id === item.id).usage).toBe(1);
	});

	it('deletes an item only a Version references', async () => {
		const item = await uploaded(png(5));
		let record = await store.create('/old/', 'page', docWith(item.url), { author });
		record = await store.publish('/old/', { etag: record.etag, author });
		record = await store.saveDraft('/old/', docWith('/elsewhere.png'), { etag: record.etag, author });
		await store.publish('/old/', { etag: record.etag, author });
		expect(await store.versions('/old/')).toHaveLength(1);

		expect((await remove(item.id)).status).toBe(204);
		await expect(s3.send(new GetObjectCommand({ Bucket: bucket, Key: item.key }))).rejects.toThrow();
		const list = await (await handlers().GET(event('GET'))).json();
		expect(list.items.map((entry: { id: string }) => entry.id)).not.toContain(item.id);
	});

	it('searches by title or filename', async () => {
		await upload(png(6), 'manuscript-folio.png');
		const list = await (await handlers().GET(event('GET', { query: '?search=folio' }))).json();
		expect(list.items.map((item: { filename: string }) => item.filename)).toEqual([
			'manuscript-folio.png'
		]);
	});

	it.each<[Action, () => Promise<Response>]>([
		['read-draft', () => handlers().GET(event('GET'))],
		['media-upload', () => upload(png(7))],
		['media-delete', () => remove('0'.repeat(64))]
	])('answers 403 when authorize denies %s', async (action, call) => {
		denied = action;
		expect((await call()).status).toBe(403);
	});

	it('lists the media actions the user is allowed', async () => {
		denied = 'media-delete';
		const list = await (await handlers().GET(event('GET'))).json();
		expect(list.allowed).toEqual(['media-upload']);
	});

	describe('as a Media source', () => {
		async function source() {
			vi.stubGlobal('location', { origin: 'http://site.test' });
			vi.stubGlobal('fetch', async (input: URL, init?: RequestInit) => {
				const request = new Request(input, init);
				const method = request.method as 'GET' | 'POST' | 'DELETE';
				return handlers()[method]({ request, url: new URL(request.url) });
			});
			return mediaSourceFor({
				forge: 'server',
				apiBase: '/dashboard/api/content',
				mediaApiBase: '/dashboard/api/media'
			});
		}

		afterEach(() => vi.unstubAllGlobals());

		mediaSourceContract({ metadata: true, usage: true, delete: true, search: true }, source);

		it('refuses to delete an item a Content document uses, with the in-use error', async () => {
			const media = await source();
			const item = await media.upload(
				new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'used.svg', { type: 'image/svg+xml' })
			);
			await store.create('/about/', 'page', docWith(item.url), { author });

			await expect(media.delete(item)).rejects.toBeInstanceOf(MediaInUseError);
			const listed = (await media.list()).find(({ id }) => id === item.id);
			expect(listed?.usage).toEqual([{ path: '/about/' }]);
		});
	});
});

describe('imageSize', () => {
	it('reads PNG dimensions and answers null for other bytes', () => {
		expect(imageSize(png(0))).toEqual({ width: 3, height: 2 });
		expect(imageSize(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
	});
});
