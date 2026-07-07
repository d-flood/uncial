import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { patSessionProvider } from './pat.js';
import type { UncialCmsSiteConfig } from '../types.js';

const config: UncialCmsSiteConfig = {
	forge: 'github',
	repo: 'octo/site',
	branch: 'main',
	contentDir: 'content',
	authWorkerUrl: '',
	appSlug: 'uncial-cms'
};

const fetchMock = vi.fn<typeof fetch>();
const promptMock = vi.fn<(message?: string) => string | null>();

beforeEach(() => {
	vi.stubGlobal('fetch', fetchMock);
	vi.stubGlobal('window', { prompt: promptMock });
});

afterEach(() => {
	fetchMock.mockReset();
	promptMock.mockReset();
	vi.unstubAllGlobals();
});

describe('patSessionProvider', () => {
	it('validates the pasted token via GET /user and builds a noreply-email session', async () => {
		promptMock.mockReturnValueOnce('  ghp_token  ');
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ login: 'octocat', id: 583231, name: 'Octo Cat' }), {
				status: 200
			})
		);

		const session = await patSessionProvider(config);

		expect(session).toEqual({
			token: 'ghp_token',
			expiresAt: null,
			repo: 'octo/site',
			user: {
				login: 'octocat',
				name: 'Octo Cat',
				email: '583231+octocat@users.noreply.github.com'
			}
		});
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(String(url)).toBe('https://api.github.com/user');
		expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ghp_token');
	});

	it('falls back to the login when the user has no display name', async () => {
		promptMock.mockReturnValueOnce('ghp_token');
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ login: 'octocat', id: 583231, name: null }), { status: 200 })
		);

		const session = await patSessionProvider(config);

		expect(session.user.name).toBe('octocat');
	});

	it('rejects when the prompt is cancelled', async () => {
		promptMock.mockReturnValueOnce(null);

		await expect(patSessionProvider(config)).rejects.toThrow(/token is required/i);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('rejects when GitHub refuses the token', async () => {
		promptMock.mockReturnValueOnce('bad-token');
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })
		);

		await expect(patSessionProvider(config)).rejects.toThrow(/401/);
	});
});
