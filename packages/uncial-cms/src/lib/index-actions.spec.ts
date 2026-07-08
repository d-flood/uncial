import { describe, expect, it, vi } from 'vitest';
import { createBlockRegistry, createSchema, normalizeDocument } from 'uncial/core';
import { NotFoundError } from './errors.js';
import { createPage, deletePage, listPages } from './index-actions.js';
import type { ForgeAdapter } from './types.js';

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
		expect(JSON.parse(content)).toEqual(
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
