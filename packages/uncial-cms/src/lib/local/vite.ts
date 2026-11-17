import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { MAX_CONTENT_BYTES, MAX_FILE_BYTES } from '../constants.js';
import { LOCAL_API_PATH } from './constants.js';

export interface LocalVitePluginOptions {
	/** Repository root: every path the endpoint receives resolves against it. */
	root: string;
	/**
	 * Repo-root-relative directories a request may address, as the site declares
	 * them. An entry with `local` sits at that FS path instead of under `root`.
	 */
	permittedRoots: Array<string | { path: string; local: string }>;
	/** Vite `server.host`; defaults to loopback because the endpoint has no auth. */
	host?: string | boolean;
}

/**
 * A base64 body spends four bytes on every three of payload, and the JSON
 * envelope adds its keys on top, so the request cap has to clear the envelope of
 * a `MAX_FILE_BYTES` upload. The decoded caps in {@link handleWrite} are the
 * ones that enforce the limits.
 */
const MAX_REQUEST_BYTES = Math.ceil(MAX_FILE_BYTES / 3) * 4 + 1024;

class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly detail: Record<string, unknown> = {}
	) {
		super(message);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
	response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
	response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request) {
		const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += bytes.byteLength;
		if (size > MAX_REQUEST_BYTES) {
			throw new HttpError(413, `Request body exceeds ${MAX_REQUEST_BYTES} bytes.`);
		}
		chunks.push(bytes);
	}

	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'));
	} catch {
		throw new HttpError(400, 'Request body must be valid JSON.');
	}
}

/**
 * The absolute paths of the directories a request may address, and the resolver
 * that confines a repo-root-relative path to them.
 */
interface Roots {
	root: string;
	permitted: Array<{ declared: string; absolute: string }>;
}

function normalizePath(path: string): string {
	const normalized = posix.normalize(path).replace(/\/+$/, '');
	return normalized === '.' ? '' : normalized;
}

function resolveRoots({ root, permittedRoots }: LocalVitePluginOptions): Roots {
	const repositoryRoot = resolve(root);
	return {
		root: repositoryRoot,
		permitted: permittedRoots.map((entry) => {
			const declared = typeof entry === 'string' ? entry : entry.path;
			return {
				declared: normalizePath(declared).replace(/^\/+/, ''),
				absolute: typeof entry === 'string' ? resolve(repositoryRoot, entry) : resolve(entry.local)
			};
		})
	};
}

function contains(directory: string, target: string): boolean {
	const from = relative(directory, target);
	return from === '' || (!from.startsWith(`..${sep}`) && from !== '..' && !isAbsolute(from));
}

type Permitted = Roots['permitted'][number];

function repositoryPath(
	roots: Roots,
	encodedPath: string
): { target: string; permitted: Permitted } {
	let path: string;
	try {
		path = decodeURIComponent(encodedPath);
	} catch {
		throw new HttpError(400, 'Path is not valid URL encoding.');
	}

	const normalized = normalizePath(path);
	for (const permitted of roots.permitted) {
		const { declared } = permitted;
		const rest =
			declared === '' || normalized === declared
				? normalized.slice(declared.length)
				: normalized.startsWith(`${declared}/`)
					? normalized.slice(declared.length + 1)
					: undefined;
		if (rest === undefined) continue;
		const target = resolve(permitted.absolute, rest);
		if (contains(permitted.absolute, target)) return { target, permitted };
	}
	const names = roots.permitted.map((permitted) => permitted.declared).join(', ');
	throw new HttpError(403, `Path must stay within ${names}.`);
}

async function handleRead(
	request: IncomingMessage,
	response: ServerResponse,
	roots: Roots,
	encodedPath: string
): Promise<void> {
	await readJson(request);
	const { target } = repositoryPath(roots, encodedPath);
	let content: Buffer;
	try {
		content = await readFile(target);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new HttpError(404, 'File not found.');
		}
		throw error;
	}
	const sha = createHash('sha256').update(content).digest('hex');
	if (content.byteLength > MAX_CONTENT_BYTES) {
		throw new HttpError(413, `File exceeds ${MAX_CONTENT_BYTES} bytes.`, { sha });
	}

	sendJson(response, 200, { content: content.toString('utf8'), sha });
}

async function handleWrite(
	request: IncomingMessage,
	response: ServerResponse,
	roots: Roots,
	encodedPath: string
): Promise<void> {
	const body = await readJson(request);
	if (!isRecord(body) || typeof body.content !== 'string') {
		throw new HttpError(400, 'Write request must contain a string content property.');
	}

	if (body.encoding !== undefined && body.encoding !== 'base64') {
		throw new HttpError(400, 'Write encoding must be base64 when provided.');
	}
	if (body.sha !== undefined && typeof body.sha !== 'string') {
		throw new HttpError(400, 'Write sha must be a string when provided.');
	}
	const { target } = repositoryPath(roots, encodedPath);
	const binary = body.encoding === 'base64';
	const content = Buffer.from(body.content, binary ? 'base64' : 'utf8');
	const limit = binary ? MAX_FILE_BYTES : MAX_CONTENT_BYTES;
	if (content.byteLength > limit) {
		throw new HttpError(413, `Content exceeds ${limit} bytes.`);
	}

	// A sha means "replace the revision I read"; the GitHub Contents API answers
	// a stale one with 409, and the editor's conflict recovery is written against
	// that. Without the check an editor autosaving against the local checkout
	// would silently overwrite a change made underneath it.
	if (typeof body.sha === 'string') {
		let current: Buffer | null;
		try {
			current = await readFile(target);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
			current = null;
		}
		const currentSha = current && createHash('sha256').update(current).digest('hex');
		if (currentSha !== body.sha) {
			throw new HttpError(409, 'The file changed on disk since it was read.');
		}
	}

	await mkdir(dirname(target), { recursive: true });
	const temporary = `${target}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporary, content);
		await rename(temporary, target);
	} finally {
		await rm(temporary, { force: true });
	}

	const sha = createHash('sha256').update(content).digest('hex');
	sendJson(response, 200, { sha, commitSha: sha });
}

async function handleDelete(
	request: IncomingMessage,
	response: ServerResponse,
	roots: Roots,
	encodedPath: string
): Promise<void> {
	await readJson(request);
	const { target } = repositoryPath(roots, encodedPath);
	try {
		await unlink(target);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new HttpError(404, 'File not found.');
		}
		throw error;
	}
	sendJson(response, 200, {});
}

async function handleList(
	request: IncomingMessage,
	response: ServerResponse,
	roots: Roots,
	encodedPath: string
): Promise<void> {
	await readJson(request);
	const { target, permitted } = repositoryPath(roots, encodedPath);
	let entries: Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>;
	try {
		entries = await readdir(target, { encoding: 'utf8', withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new HttpError(404, 'Directory not found.');
		}
		throw error;
	}
	sendJson(response, 200, {
		entries: entries
			.filter((entry) => entry.isFile() || entry.isDirectory())
			.map((entry) => ({
				path: posix.join(
					permitted.declared,
					relative(permitted.absolute, resolve(target, entry.name)).split(sep).join('/')
				),
				type: entry.isDirectory() ? 'dir' : 'file'
			}))
	});
}

export function createLocalVitePlugin(options: LocalVitePluginOptions): Plugin {
	const roots = resolveRoots(options);
	const filePrefix = `${LOCAL_API_PATH}/files/`;
	const directoryPrefix = `${LOCAL_API_PATH}/dirs/`;
	return {
		name: 'uncial-cms:local',
		apply(_config, env) {
			return env.command === 'serve';
		},
		config(_config, env) {
			if (env.command !== 'serve') return;
			const watched = roots.permitted.map((permitted) => permitted.absolute);
			return {
				server: {
					host: options.host ?? '127.0.0.1',
					// Every write under a permitted root arrives through this plugin's
					// own endpoint, so a watcher event for one is the author's own
					// autosave landing. Watched, it makes Vite full-reload the page
					// mid-edit and the editing session goes with it.
					watch: {
						ignored: [
							(path: string) =>
								watched.some((root) => path === root || path.startsWith(`${root}${sep}`))
						]
					}
				}
			};
		},
		configureServer(server) {
			server.middlewares.use((request, response, next) => {
				const path = request.url?.split('?', 1)[0] ?? '';
				const isFile = path.startsWith(filePrefix);
				const isDirectory = path.startsWith(directoryPrefix);
				if (!isFile && !isDirectory) return next();
				if (!request.headers['content-type']?.startsWith('application/json')) {
					sendJson(response, 415, { error: 'Requests must use application/json.' });
					return;
				}
				const handler = isDirectory
					? request.method === 'POST'
						? handleList
						: null
					: request.method === 'POST'
						? handleRead
						: request.method === 'PUT'
							? handleWrite
							: request.method === 'DELETE'
								? handleDelete
								: null;
				if (!handler) {
					sendJson(response, 405, { error: 'Method not allowed.' });
					return;
				}
				const encodedPath = path.slice((isDirectory ? directoryPrefix : filePrefix).length);
				void handler(request, response, roots, encodedPath).catch((error) => {
					if (error instanceof HttpError) {
						sendJson(response, error.status, { ...error.detail, error: error.message });
						return;
					}
					next(error);
				});
			});
		}
	};
}
