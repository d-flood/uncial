import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join, relative } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import {
	build,
	createServer,
	type ConfigEnv,
	type InlineConfig,
	type Plugin,
	type UserConfig
} from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mediaSourceContract } from '../../fixtures/media-source-contract.js';
import type { SiteOptions } from '../define-site.js';
import { ConflictError } from '../errors.js';
import { createLocalAdapter } from '../local/adapter.js';
import { LOCAL_API_PATH } from '../local/constants.js';
import { localSessionProvider } from '../local/session.js';
import { mediaSourceFor } from '../media-source.js';
import { planRenditions } from '../renditions/plan.js';
import type { UncialCmsSiteConfig } from '../types.js';
import { uncialCms } from './index.js';

const sharpLoaded = vi.hoisted(() => vi.fn());
vi.mock('sharp', async (importOriginal) => {
	sharpLoaded();
	return importOriginal();
});

// Under the package, so Vite resolves the deduped `svelte` from its node_modules.
const BUILDS = new URL('../../../.e2e-build/', import.meta.url).pathname;
mkdirSync(BUILDS, { recursive: true });
const directories: string[] = [];
const servers: Array<{ close(): Promise<void> }> = [];
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64'
);
const IMAGE = { default: '', input: 'image' as const, renditions: { widths: [40] } };
const json = { 'Content-Type': 'application/json' };
const src = (path: string) =>
	new URL(`../../../../uncial/src/lib/${path}`, import.meta.url).pathname;

/**
 * A repository with content, a Collection and media (outside the static dir by
 * default), and a site module under `site/`, the Vite root.
 */
function repository(renditions = true, mediaDir = 'media'): { root: string; options: SiteOptions } {
	const root = mkdtempSync(join(BUILDS, 'local-endpoint-'));
	directories.push(root);
	const image = renditions ? IMAGE : { default: '', input: 'image' as const };
	const files: Record<string, string | Buffer> = {
		'content/index.json': JSON.stringify({
			type: 'doc',
			content: [],
			meta: { image: '/media/photo.png' }
		}),
		[`${mediaDir}/photo.png`]: PNG,
		[`${mediaDir}/other.png`]: PNG,
		'secret.txt': 'private',
		'site/main.js': 'export {};',
		'site/site.ts': `import { defineSite } from ${JSON.stringify(new URL('../define-site.ts', import.meta.url).pathname)};
export const site = defineSite(${JSON.stringify(options())}, { blocks: [], meta: { image: ${JSON.stringify(image)} } });`
	};
	function options(): SiteOptions {
		return {
			contentDir: 'content',
			localContentDir: join(root, 'content'),
			mediaDir,
			localMediaDir: join(root, mediaDir),
			mediaUrlPrefix: '/media',
			collections: { states: { dir: 'states', meta: { image } } }
		};
	}
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(join(root, path, '..'), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return { root, options: options() };
}

function viteConfig(root: string, plugins: Plugin[]): InlineConfig {
	return {
		configFile: false,
		root: join(root, 'site'),
		base: '/sub/',
		publicDir: join(root, 'static'),
		logLevel: 'silent',
		optimizeDeps: { noDiscovery: true },
		plugins: [...plugins, svelte()],
		resolve: { alias: [{ find: /^uncial$/, replacement: src('index.ts') }] }
	};
}

async function listen(config: InlineConfig): Promise<AddressInfo> {
	const server = await createServer({
		appType: 'custom',
		...config,
		server: { port: 0, ...config.server }
	});
	servers.push(server);
	await server.listen();
	return server.httpServer?.address() as AddressInfo;
}

const serve = async (config: InlineConfig) => `http://127.0.0.1:${(await listen(config)).port}`;

/** The SSR build then the client build, in the order SvelteKit and Astro run them. */
async function buildSite(root: string, plugins: () => Plugin[]): Promise<string> {
	const out = join(root, 'out');
	await build({
		...viteConfig(root, plugins()),
		ssr: { noExternal: true },
		build: { ssr: 'main.js', outDir: join(out, 'server') }
	});
	await build({
		...viteConfig(root, plugins()),
		build: { outDir: join(out, 'client'), rollupOptions: { input: join(root, 'site/main.js') } }
	});
	return out;
}

const rendition = (image: string) =>
	`media/${planRenditions(image, IMAGE.renditions, '/media')[0].file}`;

afterEach(async () => {
	await Promise.all(servers.splice(0).map((server) => server.close()));
	vi.unstubAllGlobals();
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

describe('uncialCms', () => {
	it('binds the local endpoint to loopback unless given a host', async () => {
		const { root, options } = repository();
		const loopback = await listen({
			...viteConfig(root, uncialCms(options)),
			server: { host: '0.0.0.0' }
		});
		expect(loopback.address).toBe('127.0.0.1');
		const host = await listen(viteConfig(root, uncialCms(options, { host: '0.0.0.0' })));
		expect(host.address).toBe('0.0.0.0');
	});

	it('defines UNCIAL_CMS_FORGE as the forge the build targets', () => {
		type ConfigHook = (config: UserConfig, env: ConfigEnv) => UserConfig | undefined;
		const define = (options: SiteOptions, command: 'serve' | 'build') =>
			(uncialCms(options)[1].config as ConfigHook)({}, { command, mode: '' })?.define?.[
				'import.meta.env.UNCIAL_CMS_FORGE'
			];
		const options = { contentDir: 'content' };
		const github = { repo: 'd-flood/uncial', branch: 'main' };

		expect(define({ ...options, github }, 'serve')).toBe('"local"');
		expect(define({ ...options, github }, 'build')).toBe('"github"');
		expect(define(options, 'build')).toBe('"none"');
	});

	it('confines the local endpoint to the content, media and Collection directories', async () => {
		const { root, options } = repository();
		const origin = await serve(viteConfig(root, uncialCms(options)));
		const request = (path: string, init: RequestInit = {}) =>
			fetch(`${origin}${LOCAL_API_PATH}/files/${path}`, {
				method: 'POST',
				headers: json,
				body: '{}',
				...init
			});

		const record = await request('states/ca.json', {
			method: 'PUT',
			body: JSON.stringify({ content: '{}' })
		});
		expect(record.status).toBe(200);
		expect(readFileSync(join(root, 'states/ca.json'), 'utf8')).toBe('{}');
		expect((await request('secret.txt')).status).toBe(403);
		expect(
			(await request(encodeURIComponent(relative(join(root, 'content'), join(root, 'secret.txt')))))
				.status
		).toBe(403);
		expect(
			(await request('content/index.json', { headers: { 'Content-Type': 'text/plain' } })).status
		).toBe(415);
		expect(readFileSync(join(root, 'secret.txt'), 'utf8')).toBe('private');
	});

	it('serves and ships media outside the static dir, without sharp when nothing declares renditions', async () => {
		const { root, options } = repository(false);
		delete options.localMediaDir;
		const origin = await serve(viteConfig(root, uncialCms(options, { site: 'site.ts' })));

		const photo = await fetch(`${origin}/sub/media/photo.png`);
		expect(photo.headers.get('content-type')).toBe('image/png');
		expect(Buffer.from(await photo.arrayBuffer())).toEqual(PNG);
		expect((await fetch(`${origin}/sub/media/..%2Fsecret.txt`)).status).toBe(400);
		expect((await fetch(`${origin}/sub/media/r/missing.webp`)).status).toBe(404);

		const out = await buildSite(root, () => uncialCms(options, { site: 'site.ts' }));
		expect(readFileSync(join(out, 'client/media/photo.png'))).toEqual(PNG);
		expect(existsSync(join(out, 'server/media'))).toBe(false);
		expect(sharpLoaded).not.toHaveBeenCalled();
	});

	it.each(['media', 'static/media'])(
		'writes declared renditions in development, after a save, and into the build from %s',
		async (mediaDir) => {
			const { root, options } = repository(true, mediaDir);
			const origin = await serve(viteConfig(root, uncialCms(options, { site: 'site.ts' })));

			expect((await fetch(`${origin}/sub/media/photo.png`)).status).toBe(200);
			const photo = await fetch(`${origin}/sub/${rendition('/media/photo.png')}`);
			expect(photo.status).toBe(200);
			expect(photo.headers.get('content-type')).toBe('image/webp');
			expect((await fetch(`${origin}/sub/${rendition('/media/other.png')}`)).status).toBe(404);

			const record = JSON.stringify({
				type: 'doc',
				content: [],
				meta: { image: '/media/other.png' }
			});
			await fetch(`${origin}${LOCAL_API_PATH}/files/states/ca.json`, {
				method: 'PUT',
				headers: json,
				body: JSON.stringify({ content: record })
			});
			expect((await fetch(`${origin}/sub/${rendition('/media/other.png')}`)).status).toBe(200);
			expect(sharpLoaded).toHaveBeenCalled();

			const out = await buildSite(root, () => uncialCms(options, { site: 'site.ts' }));
			expect(existsSync(join(out, 'client', rendition('/media/photo.png')))).toBe(true);
			expect(existsSync(join(out, 'client', rendition('/media/other.png')))).toBe(true);
		}
	);
});

describe('the local adapter', () => {
	const CONTENT_DIR = 'content';
	const config: UncialCmsSiteConfig = {
		forge: 'local',
		contentDir: CONTENT_DIR,
		mediaDir: 'media'
	};

	async function signIn() {
		const { root, options } = repository();
		vi.stubGlobal('location', { origin: await serve(viteConfig(root, uncialCms(options))) });
		const adapter = createLocalAdapter();
		const { user } = await adapter.authenticate(config, localSessionProvider);
		return { root, adapter, author: { name: user.name, email: user.email } };
	}

	it('implements the ForgeAdapter surface and refuses a stale sha', async () => {
		const { root, adapter, author } = await signIn();
		const message = 'ignored locally';

		const write = await adapter.writeFile(`${CONTENT_DIR}/about.json`, '{"title":"About"}', {
			message,
			author
		});
		expect(write.sha).toBe(write.commitSha);
		expect(await adapter.readFile(`${CONTENT_DIR}/about.json`)).toEqual({
			content: '{"title":"About"}',
			sha: write.sha
		});
		const bytes = await adapter.writeFile(`${CONTENT_DIR}/bytes.bin`, new Uint8Array([0, 1, 2]), {
			message,
			author
		});
		expect(readFileSync(join(root, CONTENT_DIR, 'bytes.bin'))).toEqual(Buffer.from([0, 1, 2]));
		expect(await adapter.listDir(CONTENT_DIR)).toEqual(
			expect.arrayContaining([
				{ path: `${CONTENT_DIR}/about.json`, type: 'file' },
				{ path: `${CONTENT_DIR}/bytes.bin`, type: 'file' }
			])
		);
		expect(await adapter.commitStatus(write.commitSha)).toBe('success');

		writeFileSync(join(root, CONTENT_DIR, 'about.json'), '{"title":"Changed underneath"}');
		await expect(
			adapter.writeFile(`${CONTENT_DIR}/about.json`, '{}', { message, sha: write.sha, author })
		).rejects.toBeInstanceOf(ConflictError);
		expect(readFileSync(join(root, CONTENT_DIR, 'about.json'), 'utf8')).toBe(
			'{"title":"Changed underneath"}'
		);

		await adapter.deleteFile(`${CONTENT_DIR}/bytes.bin`, { message, sha: bytes.sha });
		await expect(adapter.readFile(`${CONTENT_DIR}/bytes.bin`)).rejects.toThrow(/not found/i);
	});

	describe('backing the git Media source', () => {
		mediaSourceContract(
			{ metadata: false, usage: false, delete: true, search: false },
			async () => {
				const { root, adapter, author } = await signIn();
				rmSync(join(root, 'media'), { recursive: true });
				mkdirSync(join(root, 'media'));
				return mediaSourceFor(config, { adapter, author }, { staticDir: 'static' });
			}
		);
	});
});
