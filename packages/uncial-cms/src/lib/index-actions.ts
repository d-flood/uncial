/**
 * Forge-level actions behind the `/uncial/` index UI (PRD §6.6): list the
 * content dir, seed a new page, delete a page. DOM-free so they unit-test
 * against a fake adapter; `mountIndexPage` wires them to the UI.
 */
import { normalizeDocument } from 'uncial/core';
import type { BlockRegistry, ContentDocument, ContentSchema } from 'uncial/core';
import { MAX_CONTENT_BYTES } from './constants.js';
import { serializeDocument } from './document.js';
import { NotFoundError } from './errors.js';
import { defaultMapSourceToPath } from './sveltekit/mapping.js';
import type { ForgeAdapter } from './types.js';
import { getActiveForge } from './upload-context.js';

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

export interface UploadAssetFile {
	bytes: Uint8Array;
	filename: string; // original name; used to derive the file extension
	contentType: string; // MIME type; extension fallback when filename has none
}

export interface UploadAssetOptions {
	mediaDir: string; // repo-root-relative dir the asset is committed into
	author: { name: string; email: string };
}

export interface UploadAssetResult {
	path: string; // repo-root-relative committed path (`<mediaDir>/<hash>.<ext>`)
	sha: string; // blob sha of the committed file
	commitSha: string; // commit that added it; '' when the file already existed
}

const EXTENSION_FROM_CONTENT_TYPE: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/svg+xml': 'svg'
};

/** Extension from the filename if present, else derived from the content type. */
function assetExtension(filename: string, contentType: string): string {
	const dot = filename.lastIndexOf('.');
	if (dot > 0 && dot < filename.length - 1) {
		return filename.slice(dot + 1).toLowerCase();
	}
	const type = contentType.toLowerCase();
	return EXTENSION_FROM_CONTENT_TYPE[type] ?? type.split('/')[1] ?? 'bin';
}

/** SHA-256 of the bytes, hex, truncated — the content-addressed asset name. */
async function contentHash(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
	const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'));
	return hex.join('').slice(0, 32);
}

/**
 * Commit an image into the repo at a content-addressed path under `mediaDir`.
 * Identical bytes hash to the same path, so re-uploads reuse the existing file
 * (no second commit). Files over the Contents API limit reject before any
 * network call — there is no git-blobs-API fallback (spec media non-goal).
 */
export async function uploadAsset(
	deps: { adapter: ForgeAdapter },
	file: UploadAssetFile,
	opts: UploadAssetOptions
): Promise<UploadAssetResult> {
	if (file.bytes.byteLength > MAX_CONTENT_BYTES) {
		throw new Error(
			`Image "${file.filename}" is ${file.bytes.byteLength} bytes, over the 1 MB limit of the GitHub Contents API.`
		);
	}

	const ext = assetExtension(file.filename, file.contentType);
	const hash = await contentHash(file.bytes);
	const dir = opts.mediaDir.replace(/\/+$/, '');
	const path = `${dir}/${hash}.${ext}`;

	// Content-addressed: if the path already exists, the bytes are identical.
	try {
		const existing = await deps.adapter.readFile(path);
		return { path, sha: existing.sha, commitSha: '' };
	} catch (error) {
		if (!(error instanceof NotFoundError)) throw error;
	}

	const { sha, commitSha } = await deps.adapter.writeFile(path, file.bytes, {
		message: `uncial-cms: upload ${path}`,
		author: opts.author
	});
	return { path, sha, commitSha };
}

/**
 * Editor-facing convenience over {@link uploadAsset}: resolves the adapter and
 * author from the {@link getActiveForge active editor session} so a block's
 * Upload affordance only has to supply the file and its `mediaDir`. Throws a
 * clear error when no editor is mounted (e.g. called before sign-in). Import
 * this dynamically from a block so the reader bundle stays free of CMS runtime.
 */
export async function uploadImageAsset(
	file: UploadAssetFile,
	opts: { mediaDir: string }
): Promise<UploadAssetResult> {
	const forge = getActiveForge();
	if (!forge) {
		throw new Error(
			'No active editor session — open a page in the editor and sign in before uploading.'
		);
	}
	return uploadAsset({ adapter: forge.adapter }, file, {
		mediaDir: opts.mediaDir,
		author: forge.author
	});
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
