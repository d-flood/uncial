import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { MAX_CONTENT_BYTES } from '../constants.js';
import { LOCAL_API_PATH } from './constants.js';

export interface LocalVitePluginOptions {
	contentDir: string;
}

class HttpError extends Error {
	constructor(readonly status: number, message: string) {
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
		if (size > MAX_CONTENT_BYTES) {
			throw new HttpError(413, `Request body exceeds ${MAX_CONTENT_BYTES} bytes.`);
		}
		chunks.push(bytes);
	}

	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'));
	} catch {
		throw new HttpError(400, 'Request body must be valid JSON.');
	}
}

function contentPath(contentDir: string, encodedPath: string): string {
	let path: string;
	try {
		path = decodeURIComponent(encodedPath);
	} catch {
		throw new HttpError(400, 'Path is not valid URL encoding.');
	}

	const root = resolve(contentDir);
	const target = resolve(root, path);
	const fromRoot = relative(root, target);
	if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
		throw new HttpError(403, 'Path must stay within the content directory.');
	}
	return target;
}

async function handleRead(
	request: IncomingMessage,
	response: ServerResponse,
	contentDir: string,
	encodedPath: string
): Promise<void> {
	await readJson(request);
	const target = contentPath(contentDir, encodedPath);
	let content: Buffer;
	try {
		content = await readFile(target);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new HttpError(404, 'File not found.');
		}
		throw error;
	}
	if (content.byteLength > MAX_CONTENT_BYTES) {
		throw new HttpError(413, `File exceeds ${MAX_CONTENT_BYTES} bytes.`);
	}

	sendJson(response, 200, {
		content: content.toString('utf8'),
		sha: createHash('sha256').update(content).digest('hex')
	});
}

async function handleWrite(
	request: IncomingMessage,
	response: ServerResponse,
	contentDir: string,
	encodedPath: string
): Promise<void> {
	const body = await readJson(request);
	if (!isRecord(body) || typeof body.content !== 'string') {
		throw new HttpError(400, 'Write request must contain a string content property.');
	}

	if (body.encoding !== undefined && body.encoding !== 'base64') {
		throw new HttpError(400, 'Write encoding must be base64 when provided.');
	}
	const target = contentPath(contentDir, encodedPath);
	const content = Buffer.from(body.content, body.encoding === 'base64' ? 'base64' : 'utf8');
	if (content.byteLength > MAX_CONTENT_BYTES) {
		throw new HttpError(413, `Content exceeds ${MAX_CONTENT_BYTES} bytes.`);
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
	contentDir: string,
	encodedPath: string
): Promise<void> {
	await readJson(request);
	const target = contentPath(contentDir, encodedPath);
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
	contentDir: string,
	encodedPath: string
): Promise<void> {
	await readJson(request);
	const target = contentPath(contentDir, encodedPath);
	let entries: Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>;
	try {
		entries = await readdir(target, { encoding: 'utf8', withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new HttpError(404, 'Directory not found.');
		}
		throw error;
	}
	const root = resolve(contentDir);
	sendJson(response, 200, {
		entries: entries
			.filter((entry) => entry.isFile() || entry.isDirectory())
			.map((entry) => ({
				path: relative(root, resolve(target, entry.name)).split(sep).join('/'),
				type: entry.isDirectory() ? 'dir' : 'file'
			}))
	});
}

export function createLocalVitePlugin({ contentDir }: LocalVitePluginOptions): Plugin {
	const filePrefix = `${LOCAL_API_PATH}/files/`;
	const directoryPrefix = `${LOCAL_API_PATH}/dirs/`;
	return {
		name: 'uncial-cms:local',
		apply(_config, env) {
			return env.command === 'serve';
		},
		config(_config, env) {
			if (env.command !== 'serve') return;
			return { server: { host: '127.0.0.1' } };
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
				void handler(request, response, contentDir, encodedPath).catch((error) => {
					if (error instanceof HttpError) {
						sendJson(response, error.status, { error: error.message });
						return;
					}
					next(error);
				});
			});
		}
	};
}
