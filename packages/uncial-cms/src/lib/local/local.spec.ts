import { mkdirSync, mkdtempSync, readFileSync, rmSync, watch, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_CONTENT_BYTES } from '../constants.js';
import { ConflictError } from '../errors.js';
import type { UncialCmsSiteConfig } from '../types.js';
import { createLocalAdapter, createLocalVitePlugin, localSessionProvider } from './index.js';

const directories: string[] = [];
const servers: ViteDevServer[] = [];

/** The content directory of every fixture repository, repo-root-relative. */
const CONTENT_DIR = 'packages/site/content';
const MEDIA_DIR = 'packages/site/static/uploads';

/** A fixture repository root with the content directory already made. */
function repository(): string {
	const directory = mkdtempSync(join(tmpdir(), 'uncial-cms-local-'));
	directories.push(directory);
	mkdirSync(join(directory, CONTENT_DIR), { recursive: true });
	return directory;
}

async function startServer(root: string, permittedRoots = [CONTENT_DIR]): Promise<string> {
	const server = await createServer({
		appType: 'custom',
		plugins: [createLocalVitePlugin({ root, permittedRoots })],
		server: { port: 0 },
		logLevel: 'error'
	});
	servers.push(server);
	await server.listen();
	const address = server.httpServer?.address() as AddressInfo;
	return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
	await Promise.all(servers.splice(0).map((server) => server.close()));
	vi.unstubAllGlobals();
	for (const directory of directories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe('createLocalVitePlugin', () => {
	it('mounts only while serving and binds the server to loopback', async () => {
		const plugin = createLocalVitePlugin({ root: repository(), permittedRoots: [CONTENT_DIR] });
		if (typeof plugin.apply !== 'function') {
			throw new Error('Local plugin must expose a functional Vite apply hook.');
		}

		expect(plugin.apply({}, { command: 'serve', mode: 'development' })).toBe(true);
		expect(plugin.apply({}, { command: 'build', mode: 'production' })).toBe(false);

		const server = await createServer({
			appType: 'custom',
			plugins: [plugin],
			server: { host: '0.0.0.0', port: 0 },
			logLevel: 'error'
		});
		servers.push(server);
		await server.listen();
		expect((server.httpServer?.address() as AddressInfo).address).toBe('127.0.0.1');
	});

	it('reads contained files through a JSON endpoint', async () => {
		const root = repository();
		writeFileSync(join(root, CONTENT_DIR, 'about.json'), '{"title":"About"}');
		const origin = await startServer(root);

		const response = await fetch(`${origin}/__uncial-cms/local/files/${CONTENT_DIR}/about.json`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{}'
		});

		expect(response.headers.get('content-type')).toMatch(/^application\/json/);
		expect(await response.json()).toMatchObject({ content: '{"title":"About"}', sha: expect.any(String) });
	});

	it('rejects a repository path that lies outside every permitted root', async () => {
		const root = repository();
		const outsidePath = join(root, 'secrets.json');
		writeFileSync(outsidePath, '{"title":"Private"}');
		const origin = await startServer(root, [CONTENT_DIR, MEDIA_DIR]);

		const response = await fetch(`${origin}/__uncial-cms/local/files/secrets.json`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{}'
		});

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: `Path must stay within ${CONTENT_DIR}, ${MEDIA_DIR}.`
		});
		expect(readFileSync(outsidePath, 'utf8')).toBe('{"title":"Private"}');
	});

	it('rejects an encoded path that escapes the repository root', async () => {
		const root = repository();
		const outsideDir = repository();
		const outsidePath = join(outsideDir, 'secret.json');
		writeFileSync(outsidePath, '{"title":"Private"}');
		const origin = await startServer(root);
		const traversal = encodeURIComponent(relative(root, outsidePath));

		const response = await fetch(`${origin}/__uncial-cms/local/files/${traversal}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{}'
		});

		expect(response.status).toBe(403);
		expect(readFileSync(outsidePath, 'utf8')).toBe('{"title":"Private"}');
	});

	it('writes a repository path under the media directory to that path on disk', async () => {
		const root = repository();
		const origin = await startServer(root, [CONTENT_DIR, MEDIA_DIR]);
		const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

		const response = await fetch(`${origin}/__uncial-cms/local/files/${MEDIA_DIR}/abc123.webp`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content: bytes.toString('base64'), encoding: 'base64' })
		});

		expect(response.status).toBe(200);
		expect(readFileSync(join(root, MEDIA_DIR, 'abc123.webp'))).toEqual(bytes);
	});

	it('accepts a base64 write of a payload at MAX_CONTENT_BYTES', async () => {
		const root = repository();
		const origin = await startServer(root, [CONTENT_DIR, MEDIA_DIR]);
		const bytes = Buffer.alloc(MAX_CONTENT_BYTES, 7);

		const response = await fetch(`${origin}/__uncial-cms/local/files/${MEDIA_DIR}/big.webp`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content: bytes.toString('base64'), encoding: 'base64' })
		});

		expect(response.status).toBe(200);
		expect(readFileSync(join(root, MEDIA_DIR, 'big.webp')).byteLength).toBe(MAX_CONTENT_BYTES);
	});

	it('rejects requests that are not JSON', async () => {
		const root = repository();
		writeFileSync(join(root, CONTENT_DIR, 'about.json'), '{"title":"About"}');
		const origin = await startServer(root);

		const response = await fetch(`${origin}/__uncial-cms/local/files/${CONTENT_DIR}/about.json`, {
			method: 'POST',
			headers: { 'Content-Type': 'text/plain' },
			body: '{}'
		});

		expect(response.status).toBe(415);
		expect(await response.json()).toEqual({ error: 'Requests must use application/json.' });
	});

	it('writes a JSON document at its repository path under the content directory', async () => {
		const root = repository();
		const origin = await startServer(root);

		const response = await fetch(`${origin}/__uncial-cms/local/files/${CONTENT_DIR}/about.json`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content: '{"title":"About"}' })
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			sha: expect.any(String),
			commitSha: expect.any(String)
		});
		expect(readFileSync(join(root, CONTENT_DIR, 'about.json'), 'utf8')).toBe('{"title":"About"}');
	});

	it('rejects content that exceeds MAX_CONTENT_BYTES without changing the target', async () => {
		const root = repository();
		const target = join(root, CONTENT_DIR, 'about.json');
		writeFileSync(target, '{"title":"Original"}');
		const origin = await startServer(root);

		const response = await fetch(`${origin}/__uncial-cms/local/files/${CONTENT_DIR}/about.json`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content: 'x'.repeat(MAX_CONTENT_BYTES + 1) })
		});

		expect(response.status).toBe(413);
		expect(readFileSync(target, 'utf8')).toBe('{"title":"Original"}');
	});

	it('refuses a write whose sha no longer matches what is on disk', async () => {
		const root = repository();
		const target = join(root, CONTENT_DIR, 'about.json');
		const origin = await startServer(root);
		vi.stubGlobal('location', { origin });
		const config: UncialCmsSiteConfig = { forge: 'local', contentDir: CONTENT_DIR };
		const adapter = createLocalAdapter();
		const session = await adapter.authenticate(config, localSessionProvider);
		const author = { name: session.user.name, email: session.user.email };

		const first = await adapter.writeFile(`${CONTENT_DIR}/about.json`, '{"title":"About"}', {
			message: 'ignored locally',
			author
		});
		writeFileSync(target, '{"title":"Changed underneath"}');

		await expect(
			adapter.writeFile(`${CONTENT_DIR}/about.json`, '{"title":"Mine"}', {
				message: 'ignored locally',
				sha: first.sha,
				author
			})
		).rejects.toBeInstanceOf(ConflictError);
		expect(readFileSync(target, 'utf8')).toBe('{"title":"Changed underneath"}');
	});

	it('exposes only complete documents at the target while writing', async () => {
		const root = repository();
		const target = join(root, CONTENT_DIR, 'about.json');
		const previous = '{"title":"Original"}';
		const next = JSON.stringify({ title: 'A'.repeat(512 * 1024) });
		writeFileSync(target, previous);
		const observations: string[] = [];
		const watcher = watch(join(root, CONTENT_DIR), (_event, filename) => {
			if (filename === 'about.json') observations.push(readFileSync(target, 'utf8'));
		});
		const origin = await startServer(root);

		try {
			const response = await fetch(`${origin}/__uncial-cms/local/files/${CONTENT_DIR}/about.json`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: next })
			});

			expect(response.status).toBe(200);
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(observations).toContain(next);
			expect(observations.every((content) => content === previous || content === next)).toBe(true);
		} finally {
			watcher.close();
		}
	});

	it('implements the ForgeAdapter surface without forge authentication', async () => {
		const root = repository();
		const origin = await startServer(root);
		vi.stubGlobal('location', { origin });
		const config: UncialCmsSiteConfig = { forge: 'local', contentDir: CONTENT_DIR };
		const adapter = createLocalAdapter();

		const session = await adapter.authenticate(config, localSessionProvider);
		const write = await adapter.writeFile(`${CONTENT_DIR}/about.json`, '{"title":"About"}', {
			message: 'ignored locally',
			author: { name: session.user.name, email: session.user.email }
		});

		expect(session.user).toEqual({
			login: 'local',
			name: 'Local editor',
			email: 'local@localhost'
		});
		expect(write.sha).toBe(write.commitSha);
		expect(await adapter.readFile(`${CONTENT_DIR}/about.json`)).toEqual({
			content: '{"title":"About"}',
			sha: write.sha
		});
		await adapter.writeFile(`${CONTENT_DIR}/bytes.bin`, new Uint8Array([0, 1, 2]), {
			message: 'ignored locally',
			author: { name: session.user.name, email: session.user.email }
		});
		expect(readFileSync(join(root, CONTENT_DIR, 'bytes.bin'))).toEqual(Buffer.from([0, 1, 2]));
		expect(await adapter.listDir(CONTENT_DIR)).toEqual(
			expect.arrayContaining([
				{ path: `${CONTENT_DIR}/about.json`, type: 'file' },
				{ path: `${CONTENT_DIR}/bytes.bin`, type: 'file' }
			])
		);
		expect(await adapter.commitStatus(write.commitSha)).toBe('success');

		await adapter.deleteFile(`${CONTENT_DIR}/about.json`, {
			message: 'ignored locally',
			sha: write.sha
		});
		await expect(adapter.readFile(`${CONTENT_DIR}/about.json`)).rejects.toThrow(/not found/i);
	});
});
