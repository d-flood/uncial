/**
 * Forge-level actions behind the `/uncial/` index UI (PRD §6.6): list the
 * content dir, seed a new page, delete a page. DOM-free so they unit-test
 * against a fake adapter; `mountIndexPage` wires them to the UI.
 */
import { normalizeDocument } from 'uncial/core';
import type { BlockRegistry, ContentDocument, ContentSchema } from 'uncial/core';
import { serializeDocument } from './document.js';
import { NotFoundError } from './errors.js';
import { defaultMapSourceToPath } from './sveltekit/mapping.js';
import type { ForgeAdapter } from './types.js';

export interface CreatePageDeps {
	adapter: ForgeAdapter;
	blocks: unknown;
	schema: unknown;
	author: { name: string; email: string };
}

export interface PageRef {
	pagePath: string; // site-relative, no surrounding slashes ('' = site root)
	sourcePath: string; // repo-root-relative JSON path
}

/** Seed `sourcePath` with a normalized empty document (create-mode commit). */
export async function createPage(
	deps: CreatePageDeps,
	{ pagePath, sourcePath }: PageRef
): Promise<{ sha: string; commitSha: string }> {
	const blocks = deps.blocks as BlockRegistry;
	const schema = deps.schema as ContentSchema;

	let exists = true;
	try {
		await deps.adapter.readFile(sourcePath);
	} catch (error) {
		if (!(error instanceof NotFoundError)) throw error;
		exists = false;
	}
	if (exists) {
		throw new Error(`A page already exists at "${pagePath}" (${sourcePath}).`);
	}

	const seed = normalizeDocument(
		{ type: 'doc', content: [{ type: 'paragraph' }] } as Partial<ContentDocument>,
		blocks,
		schema
	);
	return deps.adapter.writeFile(sourcePath, serializeDocument(seed, blocks, schema), {
		message: `uncial-cms: create ${pagePath}`,
		author: deps.author
	});
}

/** Delete `sourcePath` at its current sha. */
export async function deletePage(
	adapter: ForgeAdapter,
	{ pagePath, sourcePath }: PageRef
): Promise<void> {
	const { sha } = await adapter.readFile(sourcePath);
	await adapter.deleteFile(sourcePath, { message: `uncial-cms: delete ${pagePath}`, sha });
}

/** Recursively list the content dir's JSON sources, sorted by page path. */
export async function listPages(
	adapter: ForgeAdapter,
	contentDir: string,
	mapSourceToPath: (source: string) => string = (source) =>
		defaultMapSourceToPath(source, contentDir)
): Promise<PageRef[]> {
	const sources: string[] = [];
	const walk = async (dir: string): Promise<void> => {
		for (const entry of await adapter.listDir(dir)) {
			if (entry.type === 'dir') await walk(entry.path);
			else if (entry.path.endsWith('.json')) sources.push(entry.path);
		}
	};
	await walk(contentDir);

	return sources
		.map((sourcePath) => ({ pagePath: mapSourceToPath(sourcePath), sourcePath }))
		.sort((a, b) => a.pagePath.localeCompare(b.pagePath));
}
