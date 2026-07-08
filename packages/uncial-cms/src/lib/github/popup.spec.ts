import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { popupSessionProvider } from './popup.js';
import type { UncialCmsSiteConfig } from '../types.js';

const WORKER_URL = 'https://auth.example.workers.dev';
const SITE_ORIGIN = 'https://octo.github.io';

const config: UncialCmsSiteConfig = {
	forge: 'github',
	repo: 'octo/site',
	branch: 'main',
	contentDir: 'content',
	authWorkerUrl: WORKER_URL,
	appSlug: 'uncial-cms'
};

const fetchMock = vi.fn<typeof fetch>();
const openMock = vi.fn<(url?: string, target?: string, features?: string) => Window | null>();
let messageListeners: Array<(event: MessageEvent) => void>;
let popup: { closed: boolean };

async function emitMessage(origin: string, data: unknown): Promise<void> {
	// The provider registers its listener after async PKCE setup; wait for it.
	await vi.waitFor(() => {
		if (messageListeners.length === 0) throw new Error('no message listener yet');
	});
	for (const listener of [...messageListeners]) {
		listener({ origin, data } as MessageEvent);
	}
}

const sessionPayload = {
	token: 'ghs_scoped',
	expiresAt: 1_800_000_000_000,
	repo: 'octo/site',
	user: { login: 'octocat', name: 'Octo Cat', email: '583231+octocat@users.noreply.github.com' }
};

beforeEach(() => {
	messageListeners = [];
	popup = { closed: false };
	openMock.mockReturnValue(popup as unknown as Window);
	vi.stubGlobal('fetch', fetchMock);
	vi.stubGlobal('window', {
		open: openMock,
		location: { origin: SITE_ORIGIN },
		addEventListener: (type: string, listener: (event: MessageEvent) => void) => {
			if (type === 'message') messageListeners.push(listener);
		},
		removeEventListener: (type: string, listener: (event: MessageEvent) => void) => {
			messageListeners = messageListeners.filter((l) => l !== listener);
		}
	});
});

afterEach(() => {
	fetchMock.mockReset();
	openMock.mockReset();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

async function sha256Base64Url(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return btoa(String.fromCharCode(...new Uint8Array(digest)))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '');
}

describe('popupSessionProvider', () => {
	it('opens the worker popup, relays {code, state}, and exchanges them at /token', async () => {
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(sessionPayload), { status: 200 }));

		const pending = popupSessionProvider(config);
		await emitMessage(WORKER_URL, { source: 'uncial-cms-auth', code: 'the-code', state: 'the-state' });
		const session = await pending;

		expect(session).toEqual(sessionPayload);

		const authUrl = new URL(openMock.mock.calls[0]![0]!);
		expect(authUrl.origin + authUrl.pathname).toBe(`${WORKER_URL}/auth`);
		expect(authUrl.searchParams.get('repo')).toBe('octo/site');
		expect(authUrl.searchParams.get('origin')).toBe(SITE_ORIGIN);

		const [tokenUrl, init] = fetchMock.mock.calls[0]!;
		expect(String(tokenUrl)).toBe(`${WORKER_URL}/token`);
		const body = JSON.parse(String(init?.body)) as { code: string; state: string; verifier: string };
		expect(body.code).toBe('the-code');
		expect(body.state).toBe('the-state');
		// PKCE: the challenge sent to /auth is S256 of the verifier sent to /token.
		expect(authUrl.searchParams.get('challenge')).toBe(await sha256Base64Url(body.verifier));
	});

	it('ignores messages from other origins and malformed payloads', async () => {
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(sessionPayload), { status: 200 }));

		const pending = popupSessionProvider(config);
		await emitMessage('https://evil.example', {
			source: 'uncial-cms-auth',
			code: 'evil-code',
			state: 'evil-state'
		});
		await emitMessage(WORKER_URL, { code: 'no-source' });
		await emitMessage(WORKER_URL, { source: 'uncial-cms-auth', code: 'the-code', state: 'the-state' });
		await pending;

		const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as { code: string };
		expect(body.code).toBe('the-code');
	});

	it('rejects when the popup is blocked', async () => {
		openMock.mockReturnValueOnce(null);
		await expect(popupSessionProvider(config)).rejects.toThrow(/popup was blocked/i);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('rejects when the popup is closed before completing', async () => {
		vi.useFakeTimers();
		const pending = popupSessionProvider(config);
		pending.catch(() => {}); // avoid unhandled rejection while timers advance
		await vi.advanceTimersByTimeAsync(1); // let async setup register the poll
		popup.closed = true;
		await vi.advanceTimersByTimeAsync(600);
		await expect(pending).rejects.toThrow(/closed before completing/i);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('rejects with the worker error code when /token refuses', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: 'origin_not_allowed' }), { status: 403 })
		);

		const pending = popupSessionProvider(config);
		await emitMessage(WORKER_URL, { source: 'uncial-cms-auth', code: 'the-code', state: 'the-state' });

		await expect(pending).rejects.toThrow(/origin_not_allowed/);
	});

	it('rejects immediately when authWorkerUrl is not configured', async () => {
		await expect(popupSessionProvider({ ...config, authWorkerUrl: '' })).rejects.toThrow(
			/authWorkerUrl/
		);
		expect(openMock).not.toHaveBeenCalled();
	});
});
