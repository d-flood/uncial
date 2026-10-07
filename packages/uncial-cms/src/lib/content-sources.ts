import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeDocument } from 'uncial/core';
import type { ContentDocument } from 'uncial/core';
import type { Site } from './define-site.js';
import { globalRecordPath, globalSourcePath, type GlobalValue } from './globals.js';

/** Every `.json` file under the local content dir, content-dir-relative and sorted. */
export function listContentSources(localContentDir: string, prefix = ''): string[] {
	const sources: string[] = [];
	for (const entry of readdirSync(join(localContentDir, prefix), { withFileTypes: true })) {
		const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
		if (entry.isDirectory()) sources.push(...listContentSources(localContentDir, rel));
		else if (entry.isFile() && entry.name.endsWith('.json')) sources.push(rel);
	}
	return sources.sort();
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
	const schema = site.globals[name];
	if (!schema) throw new Error(`The site declares no Global named "${name}".`);
	const stored = (await readGlobal(site, name, opts.store)) as Partial<ContentDocument> | null;
	return (normalizeDocument(stored, [], schema).meta ?? {}) as GlobalValue<S, N>;
}
