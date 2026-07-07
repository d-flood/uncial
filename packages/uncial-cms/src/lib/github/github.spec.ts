import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGitHubAdapter } from './index.js';
import { ConflictError } from '../errors.js';
import type { ForgeSession, SessionProvider, UncialCmsSiteConfig } from '../types.js';

const config: UncialCmsSiteConfig = {
	forge: 'github',
	repo: 'octo/site',
	branch: 'main',
	contentDir: 'content',
	authWorkerUrl: '',
	appSlug: 'uncial-cms'
};

const session: ForgeSession = {
	token: 'test-token',
	expiresAt: null,
	repo: 'octo/site',
	user: { login: 'octocat', name: 'Octo Cat', email: '1+octocat@users.noreply.github.com' }
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function toBase64(text: string): string {
	return Buffer.from(text, 'utf-8').toString('base64');
}

function createStorageStub(): Storage {
	const store = new Map<string, string>();
	return {
		get length() {
			return store.size;
		},
		clear: () => store.clear(),
		getItem: (key: string) => store.get(key) ?? null,
		key: (index: number) => [...store.keys()][index] ?? null,
		removeItem: (key: string) => void store.delete(key),
		setItem: (key: string, value: string) => void store.set(key, value)
	};
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
	vi.stubGlobal('fetch', fetchMock);
	vi.stubGlobal('sessionStorage', createStorageStub());
});

afterEach(() => {
	fetchMock.mockReset();
	vi.unstubAllGlobals();
});

async function authenticatedAdapter(provider: SessionProvider = async () => session) {
	const adapter = createGitHubAdapter();
	await adapter.authenticate(config, provider);
	return adapter;
}

describe('authenticate', () => {
	it('returns the provider session and caches it in sessionStorage keyed by repo', async () => {
		const provider = vi.fn<SessionProvider>(async () => session);
		const adapter = createGitHubAdapter();

		const result = await adapter.authenticate(config, provider);

		expect(result).toEqual(session);
		expect(provider).toHaveBeenCalledExactlyOnceWith(config);
		const cached = sessionStorage.getItem('uncial-cms:session:octo/site');
		expect(cached && JSON.parse(cached)).toEqual(session);
	});

	it('reuses a cached session without invoking the provider', async () => {
		sessionStorage.setItem('uncial-cms:session:octo/site', JSON.stringify(session));
		const provider = vi.fn<SessionProvider>(async () => session);
		const adapter = createGitHubAdapter();

		const result = await adapter.authenticate(config, provider);

		expect(result).toEqual(session);
		expect(provider).not.toHaveBeenCalled();
	});

	it('ignores an expired cached session and re-invokes the provider', async () => {
		sessionStorage.setItem(
			'uncial-cms:session:octo/site',
			JSON.stringify({ ...session, expiresAt: 1000 })
		);
		const provider = vi.fn<SessionProvider>(async () => session);
		const adapter = createGitHubAdapter();

		const result = await adapter.authenticate(config, provider);

		expect(result).toEqual(session);
		expect(provider).toHaveBeenCalledOnce();
	});
});

describe('readFile', () => {
	it('fetches the file via the Contents API and decodes base64 content', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				content: toBase64('{"type":"doc"}'),
				encoding: 'base64',
				sha: 'abc123',
				size: 14
			})
		);
		const adapter = await authenticatedAdapter();

		const result = await adapter.readFile('content/about.json');

		expect(result).toEqual({ content: '{"type":"doc"}', sha: 'abc123' });
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(String(url)).toBe(
			'https://api.github.com/repos/octo/site/contents/content/about.json?ref=main'
		);
		expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-token');
	});

	it('decodes non-ASCII content correctly', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({ content: toBase64('déjà vu ✓'), encoding: 'base64', sha: 's', size: 12 })
		);
		const adapter = await authenticatedAdapter();

		const result = await adapter.readFile('content/i18n.json');

		expect(result.content).toBe('déjà vu ✓');
	});

	it('surfaces a clear error for documents over 1 MB instead of falling back', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({ content: '', encoding: 'none', sha: 'big', size: 2_000_000 })
		);
		const adapter = await authenticatedAdapter();

		await expect(adapter.readFile('content/huge.json')).rejects.toThrow(/1 MB/);
	});

	it('surfaces a clear error when the path is missing', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Not Found' }, 404));
		const adapter = await authenticatedAdapter();

		await expect(adapter.readFile('content/missing.json')).rejects.toThrow(/not found/i);
	});
});

describe('writeFile', () => {
	it('PUTs base64 content with sha, branch, and author, returning new shas', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({ content: { sha: 'new-sha' }, commit: { sha: 'commit-sha' } })
		);
		const adapter = await authenticatedAdapter();

		const result = await adapter.writeFile('content/about.json', '{"type":"doc"}', {
			message: 'Update about page',
			sha: 'abc123',
			author: { name: 'Octo Cat', email: '1+octocat@users.noreply.github.com' }
		});

		expect(result).toEqual({ sha: 'new-sha', commitSha: 'commit-sha' });
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(String(url)).toBe('https://api.github.com/repos/octo/site/contents/content/about.json');
		expect(init?.method).toBe('PUT');
		const body = JSON.parse(String(init?.body));
		expect(body).toEqual({
			message: 'Update about page',
			content: toBase64('{"type":"doc"}'),
			branch: 'main',
			sha: 'abc123',
			author: { name: 'Octo Cat', email: '1+octocat@users.noreply.github.com' }
		});
	});

	it('omits sha to create a new file', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({ content: { sha: 'new-sha' }, commit: { sha: 'commit-sha' } }, 201)
		);
		const adapter = await authenticatedAdapter();

		await adapter.writeFile('content/new.json', '{}', {
			message: 'Create page',
			author: { name: 'Octo Cat', email: '1+octocat@users.noreply.github.com' }
		});

		const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
		expect(body).not.toHaveProperty('sha');
	});

	it('throws ConflictError on a stale sha (409)', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'is at ... but expected ...' }, 409));
		const adapter = await authenticatedAdapter();

		await expect(
			adapter.writeFile('content/about.json', '{}', {
				message: 'Update',
				sha: 'stale',
				author: { name: 'Octo Cat', email: '1+octocat@users.noreply.github.com' }
			})
		).rejects.toBeInstanceOf(ConflictError);
	});
});

describe('deleteFile', () => {
	it('DELETEs the file with message, sha, and branch', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ commit: { sha: 'commit-sha' } }));
		const adapter = await authenticatedAdapter();

		await adapter.deleteFile('content/old.json', { message: 'Delete page', sha: 'abc123' });

		const [url, init] = fetchMock.mock.calls[0]!;
		expect(String(url)).toBe('https://api.github.com/repos/octo/site/contents/content/old.json');
		expect(init?.method).toBe('DELETE');
		expect(JSON.parse(String(init?.body))).toEqual({
			message: 'Delete page',
			sha: 'abc123',
			branch: 'main'
		});
	});
});

describe('listDir', () => {
	it('lists directory entries as file/dir paths', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse([
				{ path: 'content/about.json', type: 'file' },
				{ path: 'content/blog', type: 'dir' },
				{ path: 'content/link', type: 'symlink' }
			])
		);
		const adapter = await authenticatedAdapter();

		const result = await adapter.listDir('content');

		expect(result).toEqual([
			{ path: 'content/about.json', type: 'file' },
			{ path: 'content/blog', type: 'dir' }
		]);
		expect(String(fetchMock.mock.calls[0]![0])).toBe(
			'https://api.github.com/repos/octo/site/contents/content?ref=main'
		);
	});
});

describe('commitStatus', () => {
	it.each([
		['pending', 'pending'],
		['success', 'success'],
		['failure', 'failure'],
		['error', 'failure']
	] as const)('maps combined status state %s to %s', async (state, expected) => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ state }));
		const adapter = await authenticatedAdapter();

		await expect(adapter.commitStatus('commit-sha')).resolves.toBe(expected);
		expect(String(fetchMock.mock.calls[0]![0])).toBe(
			'https://api.github.com/repos/octo/site/commits/commit-sha/status'
		);
	});

	it('returns unknown when the status request fails', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Not Found' }, 404));
		const adapter = await authenticatedAdapter();

		await expect(adapter.commitStatus('missing')).resolves.toBe('unknown');
	});
});

describe('session expiry (401)', () => {
	it('clears the cached session, re-invokes the provider, and retries once', async () => {
		const renewed: ForgeSession = { ...session, token: 'renewed-token' };
		const provider = vi
			.fn<SessionProvider>()
			.mockResolvedValueOnce(session)
			.mockResolvedValueOnce(renewed);
		fetchMock
			.mockResolvedValueOnce(jsonResponse({ message: 'Bad credentials' }, 401))
			.mockResolvedValueOnce(
				jsonResponse({ content: toBase64('{}'), encoding: 'base64', sha: 's2', size: 2 })
			);
		const adapter = await authenticatedAdapter(provider);

		const result = await adapter.readFile('content/about.json');

		expect(result).toEqual({ content: '{}', sha: 's2' });
		expect(provider).toHaveBeenCalledTimes(2);
		const retryHeaders = new Headers(fetchMock.mock.calls[1]![1]?.headers);
		expect(retryHeaders.get('Authorization')).toBe('Bearer renewed-token');
		const cached = sessionStorage.getItem('uncial-cms:session:octo/site');
		expect(cached && JSON.parse(cached)).toEqual(renewed);
	});

	it('does not loop when the renewed session is also rejected', async () => {
		const provider = vi.fn<SessionProvider>(async () => session);
		fetchMock.mockResolvedValue(jsonResponse({ message: 'Bad credentials' }, 401));
		const adapter = await authenticatedAdapter(provider);

		await expect(adapter.readFile('content/about.json')).rejects.toThrow(/401/);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
