import { sha256Base64Url } from './encoding.js';
import {
	assertOriginAllowed,
	assertPushPermission,
	exchangeCode,
	fetchUser,
	GITHUB_OAUTH_URL,
	mintScopedToken,
	RefusalError,
	type Env
} from './github.js';
import { signState, verifyState } from './state.js';

const STATE_MAX_AGE_MS = 10 * 60 * 1000;
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
// 43 chars = base64url of 32 bytes; RFC 7636 allows 43–128 for the verifier,
// and an S256 challenge is always exactly 43.
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function json(status: number, body: unknown, headers: HeadersInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...headers }
	});
}

function refusal(status: number, error: string, corsOrigin?: string): Response {
	return json(
		status,
		{ error },
		corsOrigin ? { 'Access-Control-Allow-Origin': corsOrigin, Vary: 'Origin' } : {}
	);
}

function isWebOrigin(value: string): boolean {
	try {
		return new URL(value).origin === value;
	} catch {
		return false;
	}
}

function handleAuth(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const repo = url.searchParams.get('repo') ?? '';
	const origin = url.searchParams.get('origin') ?? '';
	const challenge = url.searchParams.get('challenge') ?? '';

	if (!REPO_PATTERN.test(repo)) return Promise.resolve(refusal(400, 'invalid_repo'));
	if (!isWebOrigin(origin)) return Promise.resolve(refusal(400, 'invalid_origin'));
	if (!CHALLENGE_PATTERN.test(challenge)) return Promise.resolve(refusal(400, 'invalid_challenge'));

	return signState({ repo, origin, challenge, iat: Date.now() }, env.STATE_SIGNING_SECRET).then(
		(state) => {
			const authorize = new URL(`${GITHUB_OAUTH_URL}/login/oauth/authorize`);
			authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
			authorize.searchParams.set('redirect_uri', new URL('/callback', url).toString());
			authorize.searchParams.set('state', state);
			authorize.searchParams.set('code_challenge', challenge);
			authorize.searchParams.set('code_challenge_method', 'S256');
			return Response.redirect(authorize.toString(), 302);
		}
	);
}

function errorPage(status: number, message: string): Response {
	return new Response(
		`<!doctype html><meta charset="utf-8"><title>uncial-cms sign-in</title><p>${message}</p>`,
		{ status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
	);
}

/**
 * Static relay: hands {code, state} back to the opener at exactly the origin
 * recovered from the verified state — the PKCE verifier never left the
 * browser, so only that opener can finish the exchange at /token.
 */
async function handleCallback(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	if (!code || !state) {
		return errorPage(400, 'GitHub did not complete the sign-in. You can close this window.');
	}

	const payload = await verifyState(state, env.STATE_SIGNING_SECRET);
	if (!payload) return errorPage(400, 'Invalid sign-in state. You can close this window.');

	// JSON.stringify + `<` escaping keeps the embedded values inert in HTML.
	const message = JSON.stringify({ source: 'uncial-cms-auth', code, state }).replaceAll(
		'<',
		'\\u003c'
	);
	const target = JSON.stringify(payload.origin).replaceAll('<', '\\u003c');
	return new Response(
		`<!doctype html><meta charset="utf-8"><title>uncial-cms sign-in</title>` +
			`<p>Completing sign-in… you can close this window.</p>` +
			`<script>window.opener?.postMessage(${message}, ${target});window.close();</script>`,
		{ headers: { 'Content-Type': 'text/html; charset=utf-8' } }
	);
}

async function handleToken(request: Request, env: Env): Promise<Response> {
	const requestOrigin = request.headers.get('Origin') ?? '';

	let body: { code?: unknown; state?: unknown; verifier?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return refusal(400, 'invalid_request', requestOrigin);
	}
	const { code, state, verifier } = body;
	if (typeof code !== 'string' || typeof state !== 'string' || typeof verifier !== 'string') {
		return refusal(400, 'invalid_request', requestOrigin);
	}

	const payload = await verifyState(state, env.STATE_SIGNING_SECRET);
	if (!payload) return refusal(400, 'invalid_state', requestOrigin);
	// CORS: every response past this point is addressed to the state's origin
	// only — never `*`, never the caller's own Origin header.
	const cors = payload.origin;

	if (Date.now() - payload.iat > STATE_MAX_AGE_MS) return refusal(400, 'stale_state', cors);
	if ((await sha256Base64Url(verifier)) !== payload.challenge) {
		return refusal(400, 'invalid_verifier', cors);
	}

	try {
		const redirectUri = new URL('/callback', request.url).toString();
		const userToken = await exchangeCode(env, code, verifier, redirectUri);
		const user = await fetchUser(userToken);
		await assertPushPermission(userToken, payload.repo, user.login);

		const scoped = await mintScopedToken(env, payload.repo);
		await assertOriginAllowed(scoped.token, payload.repo, payload.origin);

		return json(
			200,
			{
				token: scoped.token,
				expiresAt: scoped.expiresAt,
				repo: payload.repo,
				user: {
					login: user.login,
					name: user.name ?? user.login,
					email: `${user.id}+${user.login}@users.noreply.github.com`
				}
			},
			{ 'Access-Control-Allow-Origin': cors, Vary: 'Origin' }
		);
	} catch (error) {
		if (error instanceof RefusalError) return refusal(error.status, error.code, cors);
		return refusal(502, 'github_unreachable', cors);
	}
}

function handleTokenPreflight(request: Request): Response {
	// The preflight only gates whether the POST may be *sent*; the response the
	// page can actually read is still bound to the verified state origin.
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': request.headers.get('Origin') ?? '*',
			'Access-Control-Allow-Methods': 'POST',
			'Access-Control-Allow-Headers': 'Content-Type',
			'Access-Control-Max-Age': '86400',
			Vary: 'Origin'
		}
	});
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const { pathname } = new URL(request.url);
		if (pathname === '/auth' && request.method === 'GET') return handleAuth(request, env);
		if (pathname === '/callback' && request.method === 'GET') return handleCallback(request, env);
		if (pathname === '/token' && request.method === 'POST') return handleToken(request, env);
		if (pathname === '/token' && request.method === 'OPTIONS') {
			return handleTokenPreflight(request);
		}
		return json(404, { error: 'not_found' });
	}
};
