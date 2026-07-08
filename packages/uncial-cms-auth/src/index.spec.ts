import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './index.js';
import { sha256Base64Url } from './encoding.js';
import { signState } from './state.js';
import type { Env } from './github.js';

const WORKER_URL = 'https://auth.example.workers.dev';
const SITE_ORIGIN = 'https://octo.github.io';
const REPO = 'octo/site';
const VERIFIER = 'test-verifier-test-verifier-test-verifier-test';
const USER_TOKEN = 'gho_usertoken_SECRET';
const SCOPED_TOKEN = 'ghs_scoped_token';

async function makeEnv(): Promise<Env> {
	const keyPair = (await crypto.subtle.generateKey(
		{
			name: 'RSASSA-PKCS1-v1_5',
			hash: 'SHA-256',
			modulusLength: 2048,
			publicExponent: new Uint8Array([1, 0, 1])
		},
		true,
		['sign', 'verify']
	)) as CryptoKeyPair;
	const pkcs8 = (await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)) as ArrayBuffer;
	const b64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
	const pem = `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----`;
	return {
		GITHUB_APP_ID: '12345',
		GITHUB_APP_PRIVATE_KEY: pem,
		GITHUB_CLIENT_ID: 'Iv1.clientid',
		GITHUB_CLIENT_SECRET: 'clientsecret',
		STATE_SIGNING_SECRET: 'state-signing-secret'
	};
}

let env: Env;

interface GitHubMockOptions {
	permission?: string;
	push?: boolean;
	allowlistStatus?: number;
	allowlist?: unknown;
	installationStatus?: number;
}

const fetchMock = vi.fn<typeof fetch>();
/** Requests fetchMock has served, keyed by URL, for post-hoc assertions. */
let served: Array<{ url: string; init: RequestInit | undefined }>;

function mockGitHub(opts: GitHubMockOptions = {}): void {
	fetchMock.mockImplementation(async (input, init) => {
		const url = String(input);
		served.push({ url, init });

		if (url === 'https://github.com/login/oauth/access_token') {
			const body = JSON.parse(String(init?.body)) as { code?: string; code_verifier?: string };
			if (body.code !== 'good-code' || body.code_verifier !== VERIFIER) {
				return Response.json({ error: 'bad_verification_code' });
			}
			return Response.json({ access_token: USER_TOKEN, token_type: 'bearer' });
		}
		if (url === 'https://api.github.com/user') {
			return Response.json({ login: 'octocat', id: 583231, name: 'Octo Cat' });
		}
		if (url === `https://api.github.com/repos/${REPO}/collaborators/octocat/permission`) {
			return Response.json({
				permission: opts.permission ?? 'write',
				user: { permissions: { push: opts.push ?? true } }
			});
		}
		if (url === `https://api.github.com/repos/${REPO}/installation`) {
			if (opts.installationStatus) return new Response('', { status: opts.installationStatus });
			return Response.json({ id: 777 });
		}
		if (url === 'https://api.github.com/app/installations/777/access_tokens') {
			return Response.json(
				{ token: SCOPED_TOKEN, expires_at: '2026-07-08T13:00:00Z' },
				{ status: 201 }
			);
		}
		if (url === `https://api.github.com/repos/${REPO}/contents/.uncial/cms.json`) {
			if (opts.allowlistStatus) return new Response('', { status: opts.allowlistStatus });
			const allowlist = opts.allowlist ?? { allowedOrigins: [SITE_ORIGIN] };
			return Response.json({ content: btoa(JSON.stringify(allowlist)) });
		}
		throw new Error(`Unexpected fetch in test: ${url}`);
	});
}

/** Runs GET /auth and returns the signed state GitHub would echo back. */
async function issueState(): Promise<string> {
	const challenge = await sha256Base64Url(VERIFIER);
	const response = await worker.fetch(
		new Request(
			`${WORKER_URL}/auth?repo=${encodeURIComponent(REPO)}&origin=${encodeURIComponent(SITE_ORIGIN)}&challenge=${challenge}`
		),
		env
	);
	expect(response.status).toBe(302);
	const location = new URL(response.headers.get('Location')!);
	return location.searchParams.get('state')!;
}

function tokenRequest(body: unknown): Request {
	return new Request(`${WORKER_URL}/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Origin: SITE_ORIGIN },
		body: JSON.stringify(body)
	});
}

beforeEach(async () => {
	env = await makeEnv();
	served = [];
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	fetchMock.mockReset();
	vi.unstubAllGlobals();
});

describe('GET /auth', () => {
	it('redirects to GitHub authorize with a signed state and the S256 challenge', async () => {
		const challenge = await sha256Base64Url(VERIFIER);
		const response = await worker.fetch(
			new Request(`${WORKER_URL}/auth?repo=${REPO}&origin=${SITE_ORIGIN}&challenge=${challenge}`),
			env
		);

		expect(response.status).toBe(302);
		const location = new URL(response.headers.get('Location')!);
		expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize');
		expect(location.searchParams.get('client_id')).toBe(env.GITHUB_CLIENT_ID);
		expect(location.searchParams.get('redirect_uri')).toBe(`${WORKER_URL}/callback`);
		expect(location.searchParams.get('code_challenge')).toBe(challenge);
		expect(location.searchParams.get('code_challenge_method')).toBe('S256');
		expect(location.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
	});

	it.each([
		['repo=not-a-repo&origin=https://octo.github.io', 'invalid_repo'],
		[`repo=${REPO}&origin=javascript:alert(1)`, 'invalid_origin'],
		[`repo=${REPO}&origin=https://octo.github.io/path`, 'invalid_origin'],
		[`repo=${REPO}&origin=https://octo.github.io&challenge=short`, 'invalid_challenge']
	])('refuses bad params (%s → %s)', async (query, error) => {
		const response = await worker.fetch(new Request(`${WORKER_URL}/auth?${query}`), env);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error });
	});
});

describe('GET /callback', () => {
	it('serves a relay page that posts {code, state} to exactly the state origin', async () => {
		const state = await issueState();
		const response = await worker.fetch(
			new Request(`${WORKER_URL}/callback?code=good-code&state=${encodeURIComponent(state)}`),
			env
		);

		expect(response.status).toBe(200);
		const html = await response.text();
		expect(html).toContain(`"code":"good-code"`);
		expect(html).toContain(JSON.stringify(SITE_ORIGIN));
		expect(html).not.toContain("'*'");
		expect(html).not.toContain('"*"');
	});

	it('refuses a tampered state with an error page and no relay script', async () => {
		const state = await issueState();
		const response = await worker.fetch(
			new Request(`${WORKER_URL}/callback?code=good-code&state=${encodeURIComponent(state)}x`),
			env
		);
		expect(response.status).toBe(400);
		expect(await response.text()).not.toContain('postMessage');
	});
});

describe('POST /token', () => {
	it('happy path: mints a token scoped to the single repository', async () => {
		mockGitHub();
		const state = await issueState();
		const response = await worker.fetch(
			tokenRequest({ code: 'good-code', state, verifier: VERIFIER }),
			env
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			token: SCOPED_TOKEN,
			expiresAt: Date.parse('2026-07-08T13:00:00Z'),
			repo: REPO,
			user: {
				login: 'octocat',
				name: 'Octo Cat',
				email: '583231+octocat@users.noreply.github.com'
			}
		});

		const mint = served.find((r) => r.url.includes('/access_tokens'));
		expect(mint).toBeDefined();
		expect(JSON.parse(String(mint!.init?.body))).toEqual({
			repositories: ['site'],
			permissions: { contents: 'write' }
		});
	});

	it('sets the CORS allow-origin header to exactly the state origin', async () => {
		mockGitHub();
		const state = await issueState();
		const response = await worker.fetch(
			tokenRequest({ code: 'good-code', state, verifier: VERIFIER }),
			env
		);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe(SITE_ORIGIN);
	});

	it('never includes the user token in any response body', async () => {
		const state = await issueState();
		const scenarios: GitHubMockOptions[] = [
			{},
			{ permission: 'read', push: false },
			{ allowlistStatus: 404 },
			{ allowlist: { allowedOrigins: ['https://evil.example'] } }
		];
		for (const scenario of scenarios) {
			mockGitHub(scenario);
			const response = await worker.fetch(
				tokenRequest({ code: 'good-code', state, verifier: VERIFIER }),
				env
			);
			expect(await response.text()).not.toContain(USER_TOKEN);
		}
	});

	it('refuses an origin not listed in .uncial/cms.json with 403', async () => {
		mockGitHub({ allowlist: { allowedOrigins: ['https://evil.example'] } });
		const state = await issueState();
		const response = await worker.fetch(
			tokenRequest({ code: 'good-code', state, verifier: VERIFIER }),
			env
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: 'origin_not_allowed' });
	});

	it('refuses when .uncial/cms.json is missing with 403', async () => {
		mockGitHub({ allowlistStatus: 404 });
		const state = await issueState();
		const response = await worker.fetch(
			tokenRequest({ code: 'good-code', state, verifier: VERIFIER }),
			env
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: 'missing_allowlist' });
	});

	it('refuses a read-only user with 403', async () => {
		mockGitHub({ permission: 'read', push: false });
		const state = await issueState();
		const response = await worker.fetch(
			tokenRequest({ code: 'good-code', state, verifier: VERIFIER }),
			env
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: 'no_push_permission' });
		expect(served.some((r) => r.url.includes('/access_tokens'))).toBe(false);
	});

	it('refuses a tampered state with 400 and touches no GitHub API', async () => {
		mockGitHub();
		const state = await issueState();
		const response = await worker.fetch(
			tokenRequest({ code: 'good-code', state: `${state}x`, verifier: VERIFIER }),
			env
		);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'invalid_state' });
		expect(served).toEqual([]);
	});

	it('refuses a stale state (>10 min) with 400', async () => {
		mockGitHub();
		const challenge = await sha256Base64Url(VERIFIER);
		const state = await signState(
			{ repo: REPO, origin: SITE_ORIGIN, challenge, iat: Date.now() - 11 * 60 * 1000 },
			env.STATE_SIGNING_SECRET
		);
		const response = await worker.fetch(
			tokenRequest({ code: 'good-code', state, verifier: VERIFIER }),
			env
		);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'stale_state' });
	});

	it('refuses a verifier that does not match the challenge with 400', async () => {
		mockGitHub();
		const state = await issueState();
		const response = await worker.fetch(
			tokenRequest({ code: 'good-code', state, verifier: `${VERIFIER}-wrong` }),
			env
		);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'invalid_verifier' });
		expect(served).toEqual([]);
	});

	it('refuses a failed code exchange with 400', async () => {
		mockGitHub();
		const state = await issueState();
		const response = await worker.fetch(
			tokenRequest({ code: 'bad-code', state, verifier: VERIFIER }),
			env
		);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'code_exchange_failed' });
	});

	it('answers the CORS preflight so the POST can be sent', async () => {
		const response = await worker.fetch(
			new Request(`${WORKER_URL}/token`, {
				method: 'OPTIONS',
				headers: { Origin: SITE_ORIGIN }
			}),
			env
		);
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST');
	});
});
