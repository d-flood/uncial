import { mkdtempSync, readFileSync, rmSync, watch, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_CONTENT_BYTES } from '../constants.js';
import type { UncialCmsSiteConfig } from '../types.js';
import { createLocalAdapter, createLocalVitePlugin, localSessionProvider } from './index.js';

const directories: string[] = [];
const servers: ViteDevServer[] = [];

function contentDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), 'uncial-cms-local-'));
	directories.push(directory);
	return directory;
}

async function startServer(contentDir: string): Promise<string> {
	const server = await createServer({
		appType: 'custom',
		plugins: [createLocalVitePlugin({ contentDir })],
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
		const contentDir = contentDirectory();
		const plugin = createLocalVitePlugin({ contentDir });
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
		const contentDir = contentDirectory();
		writeFileSync(join(contentDir, 'about.json'), '{"title":"About"}');
		const origin = await startServer(contentDir);

		const response = await fetch(`${origin}/__uncial-cms/local/files/about.json`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{}'
		});

		expect(response.headers.get('content-type')).toMatch(/^application\/json/);
		expect(await response.json()).toMatchObject({ content: '{"title":"About"}', sha: expect.any(String) });
	});

	it('rejects an encoded path that resolves outside the content directory', async () => {
		const contentDir = contentDirectory();
		const outsideDir = contentDirectory();
		const outsidePath = join(outsideDir, 'secret.json');
		writeFileSync(outsidePath, '{"title":"Private"}');
		const origin = await startServer(contentDir);
		const traversal = encodeURIComponent(relative(contentDir, outsidePath));

		const response = await fetch(`${origin}/__uncial-cms/local/files/${traversal}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{}'
		});

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: 'Path must stay within the content directory.' });
		expect(readFileSync(outsidePath, 'utf8')).toBe('{"title":"Private"}');
	});

	it('rejects requests that are not JSON', async () => {
		const contentDir = contentDirectory();
		writeFileSync(join(contentDir, 'about.json'), '{"title":"About"}');
		const origin = await startServer(contentDir);

		const response = await fetch(`${origin}/__uncial-cms/local/files/about.json`, {
			method: 'POST',
			headers: { 'Content-Type': 'text/plain' },
			body: '{}'
		});

		expect(response.status).toBe(415);
		expect(await response.json()).toEqual({ error: 'Requests must use application/json.' });
	});

	it('writes a JSON document inside the content directory', async () => {
		const contentDir = contentDirectory();
		const origin = await startServer(contentDir);

		const response = await fetch(`${origin}/__uncial-cms/local/files/about.json`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content: '{"title":"About"}' })
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			sha: expect.any(String),
			commitSha: expect.any(String)
		});
		expect(readFileSync(join(contentDir, 'about.json'), 'utf8')).toBe('{"title":"About"}');
	});

	it('rejects content that exceeds MAX_CONTENT_BYTES without changing the target', async () => {
		const contentDir = contentDirectory();
		const target = join(contentDir, 'about.json');
		writeFileSync(target, '{"title":"Original"}');
		const origin = await startServer(contentDir);

		const response = await fetch(`${origin}/__uncial-cms/local/files/about.json`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content: 'x'.repeat(MAX_CONTENT_BYTES + 1) })
		});

		expect(response.status).toBe(413);
		expect(readFileSync(target, 'utf8')).toBe('{"title":"Original"}');
	});

	it('exposes only complete documents at the target while writing', async () => {
		const contentDir = contentDirectory();
		const target = join(contentDir, 'about.json');
		const previous = '{"title":"Original"}';
		const next = JSON.stringify({ title: 'A'.repeat(512 * 1024) });
		writeFileSync(target, previous);
		const observations: string[] = [];
		const watcher = watch(contentDir, (_event, filename) => {
			if (filename === 'about.json') observations.push(readFileSync(target, 'utf8'));
		});
		const origin = await startServer(contentDir);

		try {
			const response = await fetch(`${origin}/__uncial-cms/local/files/about.json`, {
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
		const contentDir = contentDirectory();
		const origin = await startServer(contentDir);
		vi.stubGlobal('location', { origin });
		const config: UncialCmsSiteConfig = { forge: 'local', contentDir: 'content' };
		const adapter = createLocalAdapter();

		const session = await adapter.authenticate(config, localSessionProvider);
		const write = await adapter.writeFile('content/about.json', '{"title":"About"}', {
			message: 'ignored locally',
			author: { name: session.user.name, email: session.user.email }
		});

		expect(session.user).toEqual({
			login: 'local',
			name: 'Local editor',
			email: 'local@localhost'
		});
		expect(write.sha).toBe(write.commitSha);
		expect(await adapter.readFile('content/about.json')).toEqual({
			content: '{"title":"About"}',
			sha: write.sha
		});
		await adapter.writeFile('content/bytes.bin', new Uint8Array([0, 1, 2]), {
			message: 'ignored locally',
			author: { name: session.user.name, email: session.user.email }
		});
		expect(readFileSync(join(contentDir, 'bytes.bin'))).toEqual(Buffer.from([0, 1, 2]));
		expect(await adapter.listDir('content')).toEqual(
			expect.arrayContaining([
				{ path: 'content/about.json', type: 'file' },
				{ path: 'content/bytes.bin', type: 'file' }
			])
		);
		expect(await adapter.commitStatus(write.commitSha)).toBe('success');

		await adapter.deleteFile('content/about.json', { message: 'ignored locally', sha: write.sha });
		await expect(adapter.readFile('content/about.json')).rejects.toThrow(/not found/i);
	});
});
