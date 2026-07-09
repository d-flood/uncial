import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBlockRegistry, createSchema, normalizeDocument } from 'uncial/core';
import { MAX_CONTENT_BYTES } from './constants.js';
import { NotFoundError } from './errors.js';
import { createPage, deletePage, listPages, uploadAsset, uploadImageAsset } from './index-actions.js';
import type { ForgeAdapter } from './types.js';
import { clearActiveForge, setActiveForge } from './upload-context.js';

const blocks = createBlockRegistry([]);
const schema = createSchema(blocks, {
	metaFields: { title: { default: 'Untitled page', required: true } }
});
const author = { name: 'Octo Cat', email: 'octocat@users.noreply.github.com' };

function fakeAdapter(overrides: Partial<ForgeAdapter> = {}): ForgeAdapter {
	return {
		authenticate: vi.fn(),
		readFile: vi.fn().mockRejectedValue(new NotFoundError('missing')),
		writeFile: vi.fn().mockResolvedValue({ sha: 'sha-new', commitSha: 'commit-new' }),
		deleteFile: vi.fn().mockResolvedValue(undefined),
		listDir: vi.fn().mockResolvedValue([]),
		commitStatus: vi.fn().mockResolvedValue('unknown'),
		...overrides
	};
}

describe('createPage', () => {
	const opts = { pagePath: 'team/new-page', sourcePath: 'content/team/new-page.json' };

	it('seeds a normalized empty document with a deterministic commit message', async () => {
		const adapter = fakeAdapter();
		await createPage({ adapter, blocks, schema, author }, opts);

		expect(adapter.writeFile).toHaveBeenCalledTimes(1);
		const [path, content, writeOpts] = vi.mocked(adapter.writeFile).mock.calls[0]!;
		expect(path).toBe('content/team/new-page.json');
		expect(writeOpts.sha).toBeUndefined(); // create mode
		expect(writeOpts.message).toBe('uncial-cms: create team/new-page');
		expect(writeOpts.author).toEqual(author);
		expect(JSON.parse(content as string)).toEqual(
			normalizeDocument({ type: 'doc', content: [{ type: 'paragraph' }] }, blocks, schema)
		);
	});

	it('aborts with no write call when the source file already exists', async () => {
		const adapter = fakeAdapter({
			readFile: vi.fn().mockResolvedValue({ content: '{}', sha: 'sha-existing' })
		});

		await expect(createPage({ adapter, blocks, schema, author }, opts)).rejects.toThrow(
			/already exists/
		);
		expect(adapter.writeFile).not.toHaveBeenCalled();
	});

	it('rethrows non-404 read failures without writing', async () => {
		const adapter = fakeAdapter({
			readFile: vi.fn().mockRejectedValue(new Error('rate limited'))
		});

		await expect(createPage({ adapter, blocks, schema, author }, opts)).rejects.toThrow(
			'rate limited'
		);
		expect(adapter.writeFile).not.toHaveBeenCalled();
	});
});

describe('deletePage', () => {
	it('reads the current sha and deletes with a deterministic message', async () => {
		const adapter = fakeAdapter({
			readFile: vi.fn().mockResolvedValue({ content: '{}', sha: 'sha-live' })
		});

		await deletePage(adapter, { pagePath: 'about', sourcePath: 'content/about.json' });

		expect(adapter.deleteFile).toHaveBeenCalledWith('content/about.json', {
			message: 'uncial-cms: delete about',
			sha: 'sha-live'
		});
	});
});

describe('uploadAsset', () => {
	const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
	const file = { bytes: pngBytes, filename: 'Screenshot.PNG', contentType: 'image/png' };
	const opts = { mediaDir: 'media', author };

	it('commits the bytes to <mediaDir>/<hash>.<ext> and returns that path', async () => {
		const adapter = fakeAdapter();

		const result = await uploadAsset({ adapter }, file, opts);

		expect(result.path).toMatch(/^media\/[0-9a-f]+\.png$/);
		expect(result).toEqual({ path: result.path, sha: 'sha-new', commitSha: 'commit-new' });

		expect(adapter.writeFile).toHaveBeenCalledTimes(1);
		const [path, content, writeOpts] = vi.mocked(adapter.writeFile).mock.calls[0]!;
		expect(path).toBe(result.path); // the returned path is exactly what was committed
		expect(content).toBe(pngBytes); // binary bytes, not a stringified copy
		expect(writeOpts.sha).toBeUndefined(); // create mode
		expect(writeOpts.message).toBe(`uncial-cms: upload ${result.path}`);
		expect(writeOpts.author).toEqual(author);
	});

	it('names by content hash: identical bytes collide regardless of filename', async () => {
		const adapter = fakeAdapter();

		const a = await uploadAsset({ adapter }, { ...file, filename: 'a.png' }, opts);
		const b = await uploadAsset({ adapter }, { ...file, filename: 'totally-different.png' }, opts);

		expect(b.path).toBe(a.path);
	});

	it('names by content hash: different bytes get different paths', async () => {
		const adapter = fakeAdapter();

		const a = await uploadAsset({ adapter }, file, opts);
		const b = await uploadAsset(
			{ adapter },
			{ ...file, bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x09, 0x09, 0x09]) },
			opts
		);

		expect(b.path).not.toBe(a.path);
	});

	it('derives the extension from contentType when the filename has none', async () => {
		const adapter = fakeAdapter();

		const result = await uploadAsset(
			{ adapter },
			{ bytes: pngBytes, filename: 'pasted-image', contentType: 'image/jpeg' },
			opts
		);

		expect(result.path).toMatch(/^media\/[0-9a-f]+\.jpg$/);
	});

	it('reuses an existing committed file without a second write', async () => {
		const adapter = fakeAdapter({
			readFile: vi.fn().mockResolvedValue({ content: 'existing', sha: 'sha-existing' })
		});

		const result = await uploadAsset({ adapter }, file, opts);

		expect(result).toEqual({ path: result.path, sha: 'sha-existing', commitSha: '' });
		expect(result.path).toMatch(/^media\/[0-9a-f]+\.png$/);
		expect(adapter.writeFile).not.toHaveBeenCalled();
	});

	it('rejects bytes over MAX_CONTENT_BYTES with no adapter call', async () => {
		const adapter = fakeAdapter();
		const tooBig = { ...file, bytes: new Uint8Array(MAX_CONTENT_BYTES + 1) };

		await expect(uploadAsset({ adapter }, tooBig, opts)).rejects.toThrow(/1 MB/);
		expect(adapter.readFile).not.toHaveBeenCalled();
		expect(adapter.writeFile).not.toHaveBeenCalled();
	});

	it('rethrows non-404 read failures without writing', async () => {
		const adapter = fakeAdapter({
			readFile: vi.fn().mockRejectedValue(new Error('rate limited'))
		});

		await expect(uploadAsset({ adapter }, file, opts)).rejects.toThrow('rate limited');
		expect(adapter.writeFile).not.toHaveBeenCalled();
	});

	it('joins a media dir with a trailing slash without doubling', async () => {
		const adapter = fakeAdapter();

		const result = await uploadAsset({ adapter }, file, { mediaDir: 'static/media/', author });

		expect(result.path).toMatch(/^static\/media\/[0-9a-f]+\.png$/);
	});
});

describe('uploadImageAsset', () => {
	const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
	const file = { bytes: pngBytes, filename: 'shot.png', contentType: 'image/png' };

	afterEach(() => clearActiveForge());

	it('uploads through the active editor forge, resolving its adapter + author', async () => {
		const adapter = fakeAdapter();
		setActiveForge({ adapter, author });

		const result = await uploadImageAsset(file, { mediaDir: 'packages/uncial-docs/static/uploads' });

		expect(result.path).toMatch(/^packages\/uncial-docs\/static\/uploads\/[0-9a-f]+\.png$/);
		expect(adapter.writeFile).toHaveBeenCalledTimes(1);
		const [path, , writeOpts] = vi.mocked(adapter.writeFile).mock.calls[0]!;
		expect(path).toBe(result.path);
		expect(writeOpts.author).toEqual(author); // author came from the active forge
	});

	it('throws a clear error when no editor session is active', async () => {
		await expect(uploadImageAsset(file, { mediaDir: 'media' })).rejects.toThrow(
			/no active editor session/i
		);
	});
});

describe('listPages', () => {
	it('recursively lists JSON sources and maps them to page paths', async () => {
		const listDir = vi.fn(async (path: string) => {
			if (path === 'content') {
				return [
					{ path: 'content/about.json', type: 'file' as const },
					{ path: 'content/index.json', type: 'file' as const },
					{ path: 'content/readme.md', type: 'file' as const },
					{ path: 'content/team', type: 'dir' as const }
				];
			}
			if (path === 'content/team') {
				return [{ path: 'content/team/new-page.json', type: 'file' as const }];
			}
			throw new Error(`unexpected listDir(${path})`);
		});
		const adapter = fakeAdapter({ listDir });

		const pages = await listPages(adapter, 'content');

		expect(pages).toEqual([
			{ pagePath: '', sourcePath: 'content/index.json' },
			{ pagePath: 'about', sourcePath: 'content/about.json' },
			{ pagePath: 'team/new-page', sourcePath: 'content/team/new-page.json' }
		]);
	});
});
