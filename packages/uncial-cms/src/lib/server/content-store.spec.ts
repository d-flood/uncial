import { randomBytes } from 'node:crypto';
import postgres, { type Sql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '../errors.js';
import {
	contentStoreMigrations,
	createPostgresContentStore,
	type ContentRecord,
	type ContentStore,
	type RetentionPolicy
} from './index.js';

const url = process.env.UNCIAL_TEST_DATABASE_URL;
if (!url) {
	process.stderr.write('ContentStore contract skipped: UNCIAL_TEST_DATABASE_URL is unset.\n');
}

const doc = (title: string) => ({
	version: 1,
	meta: { title },
	body: { type: 'doc', content: [] }
});
const author = 'ada';

describe.skipIf(!url)('Postgres ContentStore contract', () => {
	const schema = `uncial_spec_${randomBytes(4).toString('hex')}`;
	let admin: Sql;
	let sql: Sql;

	const storeWith = (retention: RetentionPolicy) => createPostgresContentStore(sql, { retention });
	let store: ContentStore;

	async function published(path: string, ...titles: string[]): Promise<ContentRecord> {
		let record = await store.create(path, 'page', doc(titles[0]), { author });
		for (const [i, title] of titles.entries()) {
			if (i > 0) record = await store.saveDraft(path, doc(title), { etag: record.etag, author });
			record = await store.publish(path, { etag: record.etag, author });
		}
		return record;
	}

	beforeAll(async () => {
		admin = postgres(url!, { onnotice: () => {} });
		await admin.unsafe(`create schema ${schema}`);
		sql = postgres(url!, { onnotice: () => {}, connection: { search_path: schema } });
		for (const migration of contentStoreMigrations) await sql.unsafe(migration.sql);
	});

	afterAll(async () => {
		await sql?.end();
		await admin?.unsafe(`drop schema if exists ${schema} cascade`);
		await admin?.end();
	});

	beforeEach(async () => {
		await sql`truncate uncial_content cascade`;
		store = storeWith({ keep: 10 });
	});

	it('creates a record with only a Draft', async () => {
		const record = await store.create('/about/', 'page', doc('About'), { author });
		expect(record).toMatchObject({
			kind: 'page',
			path: '/about/',
			draft: doc('About'),
			published: null,
			publishedAt: null,
			updatedBy: author
		});
		expect(await store.get('/about/')).toEqual(record);
		expect(await store.versions('/about/')).toEqual([]);
	});

	it('refuses to create over an existing path', async () => {
		await store.create('/about/', 'page', doc('About'), { author });
		await expect(store.create('/about/', 'page', doc('Again'), { author })).rejects.toThrow(
			ConflictError
		);
	});

	it('overwrites the Draft on save without creating Versions', async () => {
		let record = await published('/a/', 'One');
		record = await store.saveDraft('/a/', doc('Two'), { etag: record.etag, author });
		record = await store.saveDraft('/a/', doc('Three'), { etag: record.etag, author: 'bo' });
		expect(record).toMatchObject({ draft: doc('Three'), published: doc('One'), updatedBy: 'bo' });
		expect(await store.versions('/a/')).toEqual([]);
	});

	it('publishes the Draft and keeps the old Published copy as a Version', async () => {
		const first = await published('/a/', 'One');
		expect(first).toMatchObject({ draft: null, published: doc('One') });
		expect(first.publishedAt).toBeInstanceOf(Date);

		const draft = await store.saveDraft('/a/', doc('Two'), { etag: first.etag, author });
		const second = await store.publish('/a/', { etag: draft.etag, author: 'bo' });
		expect(second).toMatchObject({ draft: null, published: doc('Two'), updatedBy: 'bo' });
		expect(second.etag).not.toBe(draft.etag);

		const versions = await store.versions('/a/');
		expect(versions).toHaveLength(1);
		expect(versions[0].createdBy).toBe('bo');
		expect(await store.getVersion('/a/', versions[0].id)).toEqual(doc('One'));
	});

	it('refuses to publish without a Draft', async () => {
		const record = await published('/a/', 'One');
		await expect(store.publish('/a/', { etag: record.etag, author })).rejects.toThrow(/no Draft/);
		expect(await store.get('/a/')).toEqual(record);
	});

	it('rolls back a publish that fails mid-transaction', async () => {
		let record = await published('/a/', 'One');
		record = await store.saveDraft('/a/', doc('Two'), { etag: record.etag, author });
		await sql.unsafe(`
			create function uncial_spec_fail() returns trigger language plpgsql as
				$$ begin raise exception 'forced failure'; end $$;
			create trigger uncial_spec_fail before delete on uncial_content_versions
				for each statement execute function uncial_spec_fail();
		`);
		try {
			await expect(store.publish('/a/', { etag: record.etag, author })).rejects.toThrow(
				/forced failure/
			);
		} finally {
			await sql.unsafe(`drop function uncial_spec_fail() cascade`);
		}
		expect(await store.get('/a/')).toEqual(record);
		expect(await store.versions('/a/')).toEqual([]);
	});

	it('raises ConflictError for a stale etag on every mutation', async () => {
		const stale = await published('/a/', 'One', 'Two');
		const fresh = await store.saveDraft('/a/', doc('Two'), { etag: stale.etag, author });
		const [version] = await store.versions('/a/');
		const opts = { etag: stale.etag, author };

		await expect(store.saveDraft('/a/', doc('X'), opts)).rejects.toThrow(ConflictError);
		await expect(store.publish('/a/', opts)).rejects.toThrow(ConflictError);
		await expect(store.unpublish('/a/', opts)).rejects.toThrow(ConflictError);
		await expect(store.move('/a/', '/b/', opts)).rejects.toThrow(ConflictError);
		await expect(store.delete('/a/', opts)).rejects.toThrow(ConflictError);
		await expect(store.restore('/a/', version.id, opts)).rejects.toThrow(ConflictError);
		expect(await store.get('/a/')).toEqual(fresh);
	});

	it('raises NotFoundError for a missing path', async () => {
		const opts = { etag: 'x', author };
		expect(await store.get('/missing/')).toBeNull();
		await expect(store.saveDraft('/missing/', doc('X'), opts)).rejects.toThrow(NotFoundError);
		await expect(store.publish('/missing/', opts)).rejects.toThrow(NotFoundError);
		await expect(store.unpublish('/missing/', opts)).rejects.toThrow(NotFoundError);
		await expect(store.delete('/missing/', opts)).rejects.toThrow(NotFoundError);
		await expect(store.move('/missing/', '/b/', opts)).rejects.toThrow(NotFoundError);
		await expect(store.restore('/missing/', '1', opts)).rejects.toThrow(NotFoundError);
		await expect(store.getVersion('/missing/', '1')).rejects.toThrow(NotFoundError);
	});

	it('prunes to the newest N Versions under {keep}, sparing the Published copy and Draft', async () => {
		store = storeWith({ keep: 2 });
		let record = await published('/a/', 'One', 'Two', 'Three', 'Four', 'Five');
		record = await store.saveDraft('/a/', doc('Draft'), { etag: record.etag, author });

		const versions = await store.versions('/a/');
		const docs = await Promise.all(versions.map((v) => store.getVersion('/a/', v.id)));
		expect(docs).toEqual([doc('Four'), doc('Three')]);
		expect(record).toMatchObject({ published: doc('Five'), draft: doc('Draft') });
	});

	it('prunes Versions older than D days under {days}, sparing the Published copy and Draft', async () => {
		store = storeWith({ days: 30 });
		let record = await published('/a/', 'One', 'Two', 'Three');
		await sql`
			update uncial_content_versions set created_at = now() - interval '31 days'
			where id = (select min(id) from uncial_content_versions)
		`;
		record = await store.saveDraft('/a/', doc('Four'), { etag: record.etag, author });
		record = await store.publish('/a/', { etag: record.etag, author });
		record = await store.saveDraft('/a/', doc('Draft'), { etag: record.etag, author });

		const versions = await store.versions('/a/');
		const docs = await Promise.all(versions.map((v) => store.getVersion('/a/', v.id)));
		expect(docs).toEqual([doc('Three'), doc('Two')]);
		expect(record).toMatchObject({ published: doc('Four'), draft: doc('Draft') });
	});

	it('restores a Version into the Draft without touching the Published copy', async () => {
		const record = await published('/a/', 'One', 'Two');
		const [version] = await store.versions('/a/');
		const restored = await store.restore('/a/', version.id, { etag: record.etag, author: 'bo' });
		expect(restored).toMatchObject({
			draft: doc('One'),
			published: doc('Two'),
			publishedAt: record.publishedAt,
			updatedBy: 'bo'
		});
		expect(restored.etag).not.toBe(record.etag);
		expect(await store.versions('/a/')).toEqual([version]);
	});

	it('refuses to restore a Version of another record', async () => {
		await published('/a/', 'One', 'Two');
		const b = await published('/b/', 'One');
		const [version] = await store.versions('/a/');
		await expect(store.restore('/b/', version.id, { etag: b.etag, author })).rejects.toThrow(
			NotFoundError
		);
		await expect(store.getVersion('/b/', version.id)).rejects.toThrow(NotFoundError);
	});

	it('unpublishes, keeping the record and its Draft', async () => {
		let record = await published('/a/', 'One');
		record = await store.saveDraft('/a/', doc('Two'), { etag: record.etag, author });
		record = await store.unpublish('/a/', { etag: record.etag, author });
		expect(record).toMatchObject({ draft: doc('Two'), published: null, publishedAt: null });
		expect(await store.get('/a/')).toEqual(record);
	});

	it('deletes the record and its Versions', async () => {
		const record = await published('/a/', 'One', 'Two');
		await store.delete('/a/', { etag: record.etag, author });
		expect(await store.get('/a/')).toBeNull();
		expect(await store.versions('/a/')).toEqual([]);
		const [{ count }] = await sql`select count(*)::int as count from uncial_content_versions`;
		expect(count).toBe(0);
	});

	it('moves a record with its Versions', async () => {
		const record = await published('/a/', 'One', 'Two');
		const moved = await store.move('/a/', '/b/', { etag: record.etag, author });
		expect(moved).toMatchObject({ id: record.id, path: '/b/', published: doc('Two') });
		expect(await store.get('/a/')).toBeNull();
		expect(await store.versions('/b/')).toHaveLength(1);
	});

	it('refuses to move onto an existing path', async () => {
		const a = await published('/a/', 'One');
		const b = await published('/b/', 'Bee');
		await expect(store.move('/a/', '/b/', { etag: a.etag, author })).rejects.toThrow(ConflictError);
		expect(await store.get('/a/')).toEqual(a);
		expect(await store.get('/b/')).toEqual(b);
	});

	it("runs onMove in the move's transaction, rolling the move back when it throws", async () => {
		const seen: Array<{ from: string; to: string; path: string }> = [];
		store = createPostgresContentStore(sql, {
			retention: { keep: 10 },
			onMove: async (tx, { from, to, record }) => {
				const [row] = await tx`select path from uncial_content where id = ${record.id}`;
				seen.push({ from, to, path: row.path });
				if (to === '/fail/') throw new Error('refused');
			}
		});
		const a = await published('/a/', 'One');
		const moved = await store.move('/a/', '/b/', { etag: a.etag, author });
		expect(seen).toEqual([{ from: '/a/', to: '/b/', path: '/b/' }]);

		await expect(store.move('/b/', '/fail/', { etag: moved.etag, author })).rejects.toThrow('refused');
		expect(await store.get('/b/')).toEqual(moved);
		expect(await store.get('/fail/')).toBeNull();
	});

	it('lists by kind and status', async () => {
		await store.create('/draft/', 'page', doc('Draft'), { author });
		await published('/live/', 'Live');
		const post = await store.create('/news/post/', 'post', doc('Post'), { author });
		await store.publish('/news/post/', { etag: post.etag, author });

		const paths = (records: ContentRecord[]) => records.map((r) => r.path);
		expect(paths(await store.list())).toEqual(['/draft/', '/live/', '/news/post/']);
		expect(paths(await store.list({ kind: 'page' }))).toEqual(['/draft/', '/live/']);
		expect(paths(await store.list({ status: 'draft' }))).toEqual(['/draft/']);
		expect(paths(await store.list({ kind: 'page', status: 'published' }))).toEqual(['/live/']);
	});
});
