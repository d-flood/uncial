import { appJwt } from './jwt.js';

export const GITHUB_OAUTH_URL = 'https://github.com';
export const GITHUB_API_URL = 'https://api.github.com';

export interface Env {
	GITHUB_APP_ID: string;
	GITHUB_APP_PRIVATE_KEY: string;
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	STATE_SIGNING_SECRET: string;
}

/** Thrown by GitHub calls; the handler maps `code` to a 4xx/5xx `{error}` body. */
export class RefusalError extends Error {
	constructor(
		public readonly code: string,
		public readonly status: number
	) {
		super(code);
	}
}

function apiHeaders(token: string, scheme: 'Bearer' = 'Bearer'): HeadersInit {
	return {
		Accept: 'application/vnd.github+json',
		Authorization: `${scheme} ${token}`,
		'X-GitHub-Api-Version': '2022-11-28',
		'User-Agent': 'uncial-cms-auth'
	};
}

/**
 * Exchanges the OAuth code (+ client secret + PKCE verifier) for the user's
 * token. The returned token is used server-side only and must never appear in
 * any response (ticket invariant 1).
 */
export async function exchangeCode(
	env: Env,
	code: string,
	verifier: string,
	redirectUri: string
): Promise<string> {
	const response = await fetch(`${GITHUB_OAUTH_URL}/login/oauth/access_token`, {
		method: 'POST',
		headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		body: JSON.stringify({
			client_id: env.GITHUB_CLIENT_ID,
			client_secret: env.GITHUB_CLIENT_SECRET,
			code,
			code_verifier: verifier,
			redirect_uri: redirectUri
		})
	});
	const body = (await response.json().catch(() => ({}))) as {
		access_token?: string;
		error?: string;
	};
	if (!response.ok || !body.access_token) throw new RefusalError('code_exchange_failed', 400);
	return body.access_token;
}

export interface GitHubUser {
	login: string;
	id: number;
	name: string | null;
}

export async function fetchUser(userToken: string): Promise<GitHubUser> {
	const response = await fetch(`${GITHUB_API_URL}/user`, { headers: apiHeaders(userToken) });
	if (!response.ok) throw new RefusalError('code_exchange_failed', 400);
	return (await response.json()) as GitHubUser;
}

/** Ticket invariant 2a: the authenticated user must have push on the claimed repo. */
export async function assertPushPermission(
	userToken: string,
	repo: string,
	login: string
): Promise<void> {
	const response = await fetch(
		`${GITHUB_API_URL}/repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`,
		{ headers: apiHeaders(userToken) }
	);
	if (!response.ok) throw new RefusalError('no_push_permission', 403);
	const body = (await response.json()) as {
		permission?: string;
		user?: { permissions?: { push?: boolean } };
	};
	const canPush =
		body.user?.permissions?.push === true ||
		body.permission === 'admin' ||
		body.permission === 'write';
	if (!canPush) throw new RefusalError('no_push_permission', 403);
}

/**
 * Ticket invariant 3: mints an installation access token restricted to the one
 * claimed repository with contents read/write only.
 */
export async function mintScopedToken(
	env: Env,
	repo: string
): Promise<{ token: string; expiresAt: number }> {
	const jwt = await appJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);

	const installation = await fetch(`${GITHUB_API_URL}/repos/${repo}/installation`, {
		headers: apiHeaders(jwt)
	});
	if (!installation.ok) throw new RefusalError('app_not_installed', 403);
	const { id } = (await installation.json()) as { id: number };

	const [, name] = repo.split('/');
	const minted = await fetch(`${GITHUB_API_URL}/app/installations/${id}/access_tokens`, {
		method: 'POST',
		headers: { ...apiHeaders(jwt), 'Content-Type': 'application/json' },
		body: JSON.stringify({ repositories: [name], permissions: { contents: 'write' } })
	});
	if (!minted.ok) throw new RefusalError('token_mint_failed', 502);
	const body = (await minted.json()) as { token: string; expires_at: string };
	return { token: body.token, expiresAt: Date.parse(body.expires_at) };
}

/**
 * Ticket invariant 2b: `.uncial/cms.json` on the repo's default branch must
 * list the initiating origin. Read server-to-server with the worker's own
 * installation token — which is only released to the browser if this passes.
 */
export async function assertOriginAllowed(
	installationToken: string,
	repo: string,
	origin: string
): Promise<void> {
	const response = await fetch(`${GITHUB_API_URL}/repos/${repo}/contents/.uncial/cms.json`, {
		headers: apiHeaders(installationToken)
	});
	if (!response.ok) throw new RefusalError('missing_allowlist', 403);

	let allowedOrigins: unknown;
	try {
		const file = (await response.json()) as { content?: string };
		const decoded = atob((file.content ?? '').replace(/\s+/g, ''));
		allowedOrigins = (JSON.parse(decoded) as { allowedOrigins?: unknown }).allowedOrigins;
	} catch {
		throw new RefusalError('missing_allowlist', 403);
	}
	if (!Array.isArray(allowedOrigins) || !allowedOrigins.includes(origin)) {
		throw new RefusalError('origin_not_allowed', 403);
	}
}
