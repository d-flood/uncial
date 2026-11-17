import { createContentModel, normalizeDocument } from 'uncial';
import type { ContentDocument, ContentSchema, DocumentMetaSchema, MetaValues } from 'uncial';
import type { Site } from './define-site.js';
import { GLOBALS_DIR, isGlobalsPath } from './record-paths.js';

export { GLOBALS_DIR };
export const GLOBAL_KIND = 'global';

export type GlobalValue<S extends Site, N extends keyof S['globals']> = MetaValues<
	S['globals'][N]['meta']
>;

export const GLOBAL_NAME = /^[A-Za-z0-9_-]+$/;

function checkName(name: string): string {
	if (!GLOBAL_NAME.test(name)) {
		throw new Error(`"${name}" is not a Global name: use letters, digits, "-" and "_".`);
	}
	return name;
}

export function globalSourcePath(contentDir: string, name: string): string {
	return `${contentDir}/${GLOBALS_DIR}/${checkName(name)}.json`;
}

export function globalRecordPath(name: string): string {
	return `/${GLOBALS_DIR}/${checkName(name)}/`;
}

export function assertPagePath(path: string): void {
	if (isGlobalsPath(path)) throw new Error('The _globals namespace is reserved for Globals.');
}

/** The schema a meta-only record (a Global or a Collection record) normalizes against. */
export function metaSchema(meta: DocumentMetaSchema): ContentSchema {
	return createContentModel({ blocks: [], meta }).schemaFor();
}

export function globalDocument(value: Record<string, unknown>): ContentDocument {
	return { type: 'doc', content: [], meta: value };
}

export interface GlobalStore {
	get(path: string): Promise<{ published: unknown } | null>;
}

async function readGlobal(site: Site, name: string, store?: GlobalStore): Promise<unknown> {
	if (site.config.forge === 'server') {
		if (!store)
			throw new Error('A server site reads its Globals from its content store: pass { store }.');
		return (await store.get(globalRecordPath(name)))?.published ?? null;
	}
	// Reached through `process` so that bundling this server-safe module for the browser never resolves node:fs.
	const { readFile } = process.getBuiltinModule('node:fs/promises');
	try {
		return JSON.parse(await readFile(globalSourcePath(site.localContentDir, name), 'utf-8'));
	} catch (error) {
		if ((error as { code?: string }).code === 'ENOENT') return null;
		throw error;
	}
}

export async function loadGlobal<S extends Site, N extends keyof S['globals'] & string>(
	site: S,
	name: N,
	opts: { store?: GlobalStore } = {}
): Promise<GlobalValue<S, N>> {
	const global = site.globals[name];
	if (!global) throw new Error(`The site declares no Global named "${name}".`);
	const stored = (await readGlobal(site, name, opts.store)) as Partial<ContentDocument> | null;
	return (normalizeDocument(stored, [], metaSchema(global.meta)).meta ?? {}) as GlobalValue<S, N>;
}
