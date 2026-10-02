import type postgres from 'postgres';
import type { Row, Sql, TransactionSql } from 'postgres';
import { ConflictError, NotFoundError } from '../errors.js';

export type RetentionPolicy = { keep: number } | { days: number };

export interface ContentRecord {
	id: string;
	kind: string;
	path: string;
	draft: unknown | null;
	published: unknown | null;
	etag: string;
	publishedAt: Date | null;
	updatedAt: Date;
	updatedBy: string;
}

export interface VersionSummary {
	id: string;
	createdAt: Date;
	createdBy: string;
}

export interface ContentStore {
	get(path: string): Promise<ContentRecord | null>;
	list(query?: { kind?: string; status?: 'draft' | 'published' | 'any' }): Promise<ContentRecord[]>;
	create(
		path: string,
		kind: string,
		draft: unknown,
		opts: { author: string }
	): Promise<ContentRecord>;
	saveDraft(
		path: string,
		draft: unknown,
		opts: { etag: string; author: string }
	): Promise<ContentRecord>;
	publish(path: string, opts: { etag: string; author: string }): Promise<ContentRecord>;
	unpublish(path: string, opts: { etag: string; author: string }): Promise<ContentRecord>;
	delete(path: string, opts: { etag: string; author: string }): Promise<void>;
	move(from: string, to: string, opts: { etag: string; author: string }): Promise<ContentRecord>;
	versions(path: string): Promise<VersionSummary[]>;
	getVersion(path: string, versionId: string): Promise<unknown>;
	restore(
		path: string,
		versionId: string,
		opts: { etag: string; author: string }
	): Promise<ContentRecord>;
}

type WriteOpts = { etag: string; author: string };

const UNIQUE_VIOLATION = '23505';

function toRecord(row: Row): ContentRecord {
	return {
		id: row.id,
		kind: row.kind,
		path: row.path,
		draft: row.draft,
		published: row.published,
		etag: row.etag,
		publishedAt: row.published_at,
		updatedAt: row.updated_at,
		updatedBy: row.updated_by
	};
}

function isUniqueViolation(error: unknown): boolean {
	return (error as { code?: string })?.code === UNIQUE_VIOLATION;
}

export function createPostgresContentStore(
	sql: Sql,
	opts: { retention: RetentionPolicy }
): ContentStore {
	const json = (doc: unknown) => sql.json(doc as postgres.JSONValue);

	async function lock(tx: TransactionSql, path: string, etag: string): Promise<Row> {
		const [row] = await tx`select * from uncial_content where path = ${path} for update`;
		if (!row) throw new NotFoundError(`No content at ${path}.`);
		if (row.etag !== etag) throw new ConflictError();
		return row;
	}

	async function prune(tx: TransactionSql, contentId: string) {
		const { retention } = opts;
		if ('keep' in retention) {
			await tx`
				delete from uncial_content_versions
				where content_id = ${contentId}
					and id not in (
						select id from uncial_content_versions
						where content_id = ${contentId}
						order by id desc
						limit ${retention.keep}
					)
			`;
		} else {
			await tx`
				delete from uncial_content_versions
				where content_id = ${contentId}
					and created_at < now() - make_interval(days => ${retention.days})
			`;
		}
	}

	return {
		async get(path) {
			const [row] = await sql`select * from uncial_content where path = ${path}`;
			return row ? toRecord(row) : null;
		},

		async list({ kind, status = 'any' } = {}) {
			const rows = await sql`
				select * from uncial_content
				where true
					${kind === undefined ? sql`` : sql`and kind = ${kind}`}
					${status === 'draft' ? sql`and draft is not null` : sql``}
					${status === 'published' ? sql`and published is not null` : sql``}
				order by path
			`;
			return rows.map(toRecord);
		},

		async create(path, kind, draft, { author }) {
			try {
				const [row] = await sql`
					insert into uncial_content (kind, path, draft, updated_by)
					values (${kind}, ${path}, ${json(draft)}, ${author})
					returning *
				`;
				return toRecord(row);
			} catch (error) {
				if (isUniqueViolation(error)) throw new ConflictError(`Content already exists at ${path}.`);
				throw error;
			}
		},

		async saveDraft(path, draft, { etag, author }) {
			return sql.begin(async (tx) => {
				await lock(tx, path, etag);
				const [row] = await tx`
					update uncial_content
					set draft = ${json(draft)}, etag = gen_random_uuid()::text,
						updated_at = now(), updated_by = ${author}
					where path = ${path}
					returning *
				`;
				return toRecord(row);
			});
		},

		async publish(path, { etag, author }) {
			return sql.begin(async (tx) => {
				const current = await lock(tx, path, etag);
				if (current.draft === null) throw new Error(`Nothing to publish: ${path} has no Draft.`);
				if (current.published !== null) {
					await tx`
						insert into uncial_content_versions (content_id, doc, created_by)
						values (${current.id}, ${json(current.published)}, ${author})
					`;
				}
				const [row] = await tx`
					update uncial_content
					set published = draft, draft = null, published_at = now(),
						etag = gen_random_uuid()::text, updated_at = now(), updated_by = ${author}
					where id = ${current.id}
					returning *
				`;
				await prune(tx, current.id);
				return toRecord(row);
			});
		},

		async unpublish(path, { etag, author }) {
			return sql.begin(async (tx) => {
				await lock(tx, path, etag);
				const [row] = await tx`
					update uncial_content
					set published = null, published_at = null,
						etag = gen_random_uuid()::text, updated_at = now(), updated_by = ${author}
					where path = ${path}
					returning *
				`;
				return toRecord(row);
			});
		},

		async delete(path, { etag }) {
			await sql.begin(async (tx) => {
				await lock(tx, path, etag);
				await tx`delete from uncial_content where path = ${path}`;
			});
		},

		async move(from, to, { etag, author }) {
			try {
				return await sql.begin(async (tx) => {
					await lock(tx, from, etag);
					const [row] = await tx`
						update uncial_content
						set path = ${to}, etag = gen_random_uuid()::text,
							updated_at = now(), updated_by = ${author}
						where path = ${from}
						returning *
					`;
					return toRecord(row);
				});
			} catch (error) {
				if (isUniqueViolation(error)) throw new ConflictError(`Content already exists at ${to}.`);
				throw error;
			}
		},

		async versions(path) {
			const rows = await sql`
				select v.id::text, v.created_at, v.created_by from uncial_content_versions v
				join uncial_content c on c.id = v.content_id
				where c.path = ${path}
				order by v.id desc
			`;
			return rows.map((row) => ({
				id: row.id,
				createdAt: row.created_at,
				createdBy: row.created_by
			}));
		},

		async getVersion(path, versionId) {
			const [version] = await sql`
				select v.doc from uncial_content_versions v
				join uncial_content c on c.id = v.content_id
				where c.path = ${path} and v.id::text = ${versionId}
			`;
			if (!version) throw new NotFoundError(`No Version ${versionId} of ${path}.`);
			return version.doc;
		},

		async restore(path, versionId, { etag, author }) {
			return sql.begin(async (tx) => {
				const current = await lock(tx, path, etag);
				const [version] = await tx`
					select doc from uncial_content_versions
					where content_id = ${current.id} and id::text = ${versionId}
				`;
				if (!version) throw new NotFoundError(`No Version ${versionId} of ${path}.`);
				const [row] = await tx`
					update uncial_content
					set draft = ${json(version.doc)}, etag = gen_random_uuid()::text,
						updated_at = now(), updated_by = ${author}
					where id = ${current.id}
					returning *
				`;
				return toRecord(row);
			});
		}
	};
}
