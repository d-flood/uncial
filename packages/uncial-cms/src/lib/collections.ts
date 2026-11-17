import { normalizeDocument, type ContentDocument, type MetaValues } from 'uncial';
import type { CollectionDeclaration, Site } from './define-site.js';
import { parseDocument, serializeDocument } from './document.js';
import { NotFoundError } from './errors.js';
import { metaSchema } from './globals.js';
import { deletePage } from './index-actions.js';
import { collectionRecordPath, collectionSlug, trimSlashes } from './record-paths.js';
import { repositoryRoot } from './repository-root.js';
import type { ServerForgeAdapter } from './server-forge/adapter.js';
import type { ForgeAdapter, UncialCmsSiteConfig } from './types.js';

export type CollectionRecord<S extends Site, N extends keyof S['collections']> = {
	slug: string;
	meta: MetaValues<S['collections'][N]['meta']>;
};

/** The server forge's content store, as `loadCollection` reads it. */
export interface CollectionStore {
	list(query: { status: 'published' }): Promise<Array<{ path: string; published: unknown }>>;
}

function recordMeta(collection: CollectionDeclaration, stored: unknown): Record<string, unknown> {
	return (
		normalizeDocument(stored as Partial<ContentDocument> | null, [], metaSchema(collection.meta))
			.meta ?? {}
	);
}

async function readRecordFiles(
	contentDir: string,
	localContentDir: string,
	recordDir: string
): Promise<Array<{ slug: string; value: unknown }>> {
	// Reached through `process` so that bundling this server-safe module for the browser never resolves node:fs.
	const { readdir, readFile } = process.getBuiltinModule('node:fs/promises');
	const { resolve, sep } = process.getBuiltinModule('node:path');
	const dir = resolve(repositoryRoot(contentDir, localContentDir), trimSlashes(recordDir));
	let files: string[];
	try {
		files = await readdir(dir, { recursive: true });
	} catch (error) {
		if ((error as { code?: string }).code === 'ENOENT') return [];
		throw error;
	}
	return Promise.all(
		files
			.filter((file) => file.endsWith('.json'))
			.map(async (file) => ({
				slug: file.slice(0, -'.json'.length).split(sep).join('/'),
				value: JSON.parse(await readFile(resolve(dir, file), 'utf-8')) as unknown
			}))
	);
}

/** Every record of a Collection, meta normalized against its fields and sorted by slug. */
export async function loadCollection<S extends Site, N extends keyof S['collections'] & string>(
	site: S,
	name: N,
	opts: { store?: CollectionStore } = {}
): Promise<Array<CollectionRecord<S, N>>> {
	const collection = site.collections[name];
	if (!collection) throw new Error(`The site declares no Collection named "${name}".`);
	let stored: Array<{ slug: string; value: unknown }>;
	if (site.config.forge === 'server') {
		if (!opts.store)
			throw new Error(
				'A server site reads its Collections from its content store: pass { store }.'
			);
		const config = site.config;
		stored = (await opts.store.list({ status: 'published' })).flatMap((record) => {
			const slug = collectionSlug(config, collection.dir, record.path);
			return slug === undefined ? [] : [{ slug, value: record.published }];
		});
	} else {
		stored = await readRecordFiles(site.config.contentDir, site.localContentDir, collection.dir);
	}
	return stored
		.map(
			({ slug, value }) => ({ slug, meta: recordMeta(collection, value) }) as CollectionRecord<S, N>
		)
		.sort((a, b) => a.slug.localeCompare(b.slug));
}

export interface CollectionDeps {
	adapter: ForgeAdapter;
	config: UncialCmsSiteConfig;
}

async function sources(deps: CollectionDeps, dir: string): Promise<string[]> {
	if (deps.config.forge === 'server') {
		return (await (deps.adapter as ServerForgeAdapter).list()).map((record) => record.path);
	}
	const found: string[] = [];
	const walk = async (path: string) => {
		for (const entry of await deps.adapter.listDir(path)) {
			if (entry.type === 'dir') await walk(entry.path);
			else found.push(entry.path);
		}
	};
	try {
		await walk(trimSlashes(dir));
	} catch (error) {
		if (!(error instanceof NotFoundError)) throw error;
	}
	return found;
}

/** Each record's slug and the first string value among its meta fields, sorted by slug. */
export async function listCollectionRecords(
	deps: CollectionDeps,
	collection: CollectionDeclaration
): Promise<Array<{ slug: string; summary?: string }>> {
	const slugs = (await sources(deps, collection.dir)).flatMap(
		(source) => collectionSlug(deps.config, collection.dir, source) ?? []
	);
	const records = await Promise.all(
		slugs.map(async (slug) => {
			const { value } = await readCollectionRecord(deps, collection, slug);
			const summary = Object.values(value).find(
				(value): value is string => typeof value === 'string' && value !== ''
			);
			return { slug, summary };
		})
	);
	return records.sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function readCollectionRecord(
	deps: CollectionDeps,
	collection: CollectionDeclaration,
	slug: string
): Promise<{ value: Record<string, unknown>; sha?: string }> {
	const path = collectionRecordPath(deps.config, collection.dir, slug);
	try {
		const file = await deps.adapter.readFile(path);
		const value = parseDocument(file.content, [], metaSchema(collection.meta)).meta ?? {};
		return { value, sha: file.sha };
	} catch (error) {
		if (!(error instanceof NotFoundError)) throw error;
		return { value: recordMeta(collection, null) };
	}
}

/** Commit a record; the server forge publishes it at once, as it does a Global. */
export async function saveCollectionRecord(
	deps: CollectionDeps & { author: { name: string; email: string } },
	collection: CollectionDeclaration & { name: string },
	record: { slug: string; meta: Record<string, unknown>; sha?: string }
): Promise<{ sha: string; commitSha: string }> {
	const path = collectionRecordPath(deps.config, collection.dir, record.slug);
	const document: ContentDocument = { type: 'doc', content: [], meta: record.meta };
	const content = serializeDocument(document, [], metaSchema(collection.meta));
	const written = await deps.adapter.writeFile(path, content, {
		message: `uncial-cms: save ${collection.name} ${record.slug}`,
		sha: record.sha,
		author: deps.author
	});
	if (deps.config.forge !== 'server') return written;
	const published = await (deps.adapter as ServerForgeAdapter).publish(path, written.sha);
	return { sha: published.etag, commitSha: '' };
}

export function deleteCollectionRecord(
	deps: CollectionDeps,
	collection: CollectionDeclaration & { name: string },
	slug: string
): Promise<void> {
	return deletePage(deps.adapter, {
		pagePath: `${collection.name}/${slug}`,
		sourcePath: collectionRecordPath(deps.config, collection.dir, slug)
	});
}
