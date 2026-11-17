/**
 * Forge-level actions behind the `/uncial/` index UI (PRD §6.6): list the
 * content dir, seed a new page, delete a page. DOM-free so they unit-test
 * against a fake adapter; the Dashboard wires them to the UI.
 */
import { normalizeDocument } from 'uncial';
import type { BlockRegistry, ContentDocument, ContentSchema, DocumentMetaSchema } from 'uncial';
import { MAX_FILE_BYTES, MAX_IMAGE_BYTES } from './constants.js';
import type { Site } from './define-site.js';
import { parseDocument, serializeDocument } from './document.js';
import { FileTooLargeError, NotFoundError } from './errors.js';
import {
	globalDocument,
	globalRecordPath,
	globalSourcePath,
	GLOBALS_DIR,
	metaSchema
} from './globals.js';
import { defaultMapSourceToPath } from './paths/index.js';
import { trimSlashes } from './record-paths.js';
import type { ServerForgeAdapter } from './server-forge/adapter.js';
import type { ForgeAdapter, UncialCmsSiteConfig } from './types.js';
import { configMediaDir } from './upload-context.js';

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

export async function readStoredGlobal(
	deps: { adapter: ForgeAdapter; config: UncialCmsSiteConfig },
	global: { name: string; meta: DocumentMetaSchema }
): Promise<{ value: Record<string, unknown>; sha?: string }> {
	const { config } = deps;
	const schema = metaSchema(global.meta);
	const path =
		config.forge === 'server'
			? globalRecordPath(global.name)
			: globalSourcePath(config.contentDir, global.name);
	try {
		const file = await deps.adapter.readFile(path);
		return { value: parseDocument(file.content, [], schema).meta ?? {}, sha: file.sha };
	} catch (error) {
		if (!(error instanceof NotFoundError)) throw error;
		return { value: normalizeDocument(null, [], schema).meta ?? {} };
	}
}

export interface SaveGlobalDeps {
	adapter: ForgeAdapter;
	config: UncialCmsSiteConfig;
	author: { name: string; email: string };
}

export async function saveGlobal(
	deps: SaveGlobalDeps,
	global: { name: string; meta: DocumentMetaSchema; value: Record<string, unknown>; sha?: string }
): Promise<{ sha: string; commitSha: string }> {
	const { name, meta, value, sha } = global;
	const content = serializeDocument(globalDocument(value), [], metaSchema(meta));
	if (deps.config.forge === 'server') {
		const adapter = deps.adapter as ServerForgeAdapter;
		const record = await adapter.saveGlobal(name, JSON.parse(content), sha);
		return { sha: record.etag, commitSha: '' };
	}
	return deps.adapter.writeFile(globalSourcePath(deps.config.contentDir, name), content, {
		message: `uncial-cms: save global ${name}`,
		sha,
		author: deps.author
	});
}

export interface UploadAssetFile {
	bytes: Uint8Array;
	filename: string; // original name; used to derive the file extension
	contentType: string; // MIME type; extension fallback when filename has none
}

export interface UploadAssetOptions {
	/** Repo-root-relative dir the asset is committed into; defaults from `site`. */
	mediaDir?: string;
	/** Supplies `mediaDir` when it is not passed explicitly. */
	site?: Site;
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
 * Commit a file into the repo at a content-addressed path under `mediaDir`.
 * Identical bytes hash to the same path, so re-uploads reuse the existing file
 * (no second commit). An image over `MAX_IMAGE_BYTES`, or any other file over
 * `MAX_FILE_BYTES`, rejects before any network call.
 */
export async function uploadAsset(
	deps: { adapter: ForgeAdapter },
	file: UploadAssetFile,
	opts: UploadAssetOptions
): Promise<UploadAssetResult> {
	const image = file.contentType.startsWith('image/');
	const limit = image ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
	if (file.bytes.byteLength > limit) {
		throw new Error(
			`${image ? 'Image' : 'File'} "${file.filename}" is ${file.bytes.byteLength} bytes, over the ${limit / (1024 * 1024)} MB upload limit.`
		);
	}

	const ext = assetExtension(file.filename, file.contentType);
	const hash = await contentHash(file.bytes);
	const dir = resolveMediaDir(opts.mediaDir, opts.site && configMediaDir(opts.site.config)).replace(
		/\/+$/,
		''
	);
	const path = `${dir}/${hash}.${ext}`;

	// Content-addressed: if the path already exists, the bytes are identical.
	try {
		const existing = await deps.adapter.readFile(path);
		return { path, sha: existing.sha, commitSha: '' };
	} catch (error) {
		if (error instanceof FileTooLargeError) return { path, sha: error.sha, commitSha: '' };
		if (!(error instanceof NotFoundError)) throw error;
	}

	const { sha, commitSha } = await deps.adapter.writeFile(path, file.bytes, {
		message: `uncial-cms: upload ${path}`,
		author: opts.author
	});
	return { path, sha, commitSha };
}

/** `mediaDir` from the most specific source that supplies one. */
export function resolveMediaDir(...candidates: Array<string | undefined>): string {
	const dir = candidates.find((candidate) => candidate);
	if (!dir) {
		throw new Error(
			'No media directory for the upload: pass `mediaDir`, or give a `site` whose config sets it.'
		);
	}
	return dir;
}

export async function listPages(
	adapter: ForgeAdapter,
	contentDir: string,
	collectionDirs: string[] = []
): Promise<PageRef[]> {
	const sources: string[] = [];
	const skipped = new Set([`${contentDir}/${GLOBALS_DIR}`, ...collectionDirs.map(trimSlashes)]);
	const walk = async (dir: string): Promise<void> => {
		for (const entry of await adapter.listDir(dir)) {
			if (entry.type === 'dir') {
				if (!skipped.has(entry.path)) await walk(entry.path);
			} else if (entry.path.endsWith('.json')) sources.push(entry.path);
		}
	};
	await walk(contentDir);

	return sources
		.map((sourcePath) => ({ pagePath: defaultMapSourceToPath(sourcePath, contentDir), sourcePath }))
		.sort((a, b) => a.pagePath.localeCompare(b.pagePath));
}
