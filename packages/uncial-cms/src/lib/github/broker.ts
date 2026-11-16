import { GITHUB_API_URL } from './adapter.js';
import type { ForgeSession, GitHubSiteConfig, SessionProvider } from '../types.js';

export interface BrokerSessionOptions {
	/** Origin of a code-exchange broker serving `POST /github/token` and `/github/refresh`. */
	brokerOrigin: string;
	/** The GitHub App's client id, registered with the broker. */
	clientId: string;
	/** The GitHub App's slug, named when the App cannot reach the repository. */
	appSlug: string;
	/** The site's base path; the callback is the Dashboard at `<basePath>/uncial/`. */
	basePath?: string;
}

const STATE_KEY = 'uncial-cms:broker-state';
const RELAY_SOURCE = 'uncial-cms-broker';

interface Relay {
	source: typeof RELAY_SOURCE;
	state: string;
	code: string;
	error: string;
	errorDescription: string;
}

interface Grant {
	token: string;
	expiresAt: number | null;
	refreshToken: string;
	refreshExpiresAt: number | null;
}

const refreshKey = (repo: string) => `uncial-cms:broker-refresh:${repo}`;

function readRefresh(repo: string): Grant | null {
	try {
		const grant = JSON.parse(localStorage.getItem(refreshKey(repo)) ?? 'null') as Grant | null;
		if (!grant?.refreshToken) return null;
		return grant.refreshExpiresAt === null || grant.refreshExpiresAt > Date.now() ? grant : null;
	} catch {
		return null;
	}
}

function writeRefresh(repo: string, grant: Grant): void {
	try {
		if (grant.refreshToken) localStorage.setItem(refreshKey(repo), JSON.stringify(grant));
		else localStorage.removeItem(refreshKey(repo));
	} catch {
		// Storage blocked: the next sign-in falls back to the popup.
	}
}

/** Forget the refresh token kept for `repo`, so the next sign-in asks GitHub again. */
export function forgetBrokerGrant(repo: string): void {
	try {
		localStorage.removeItem(refreshKey(repo));
	} catch {
		// Storage blocked: nothing was kept.
	}
}

/**
 * Called by the Dashboard as it loads: in the sign-in popup GitHub returns to
 * the Dashboard with `code` and `state`, which go back to the opener here.
 * True when this page load is that callback, so the Dashboard renders nothing else.
 */
export function relayBrokerCallback(): boolean {
	if (typeof window === 'undefined') return false;
	const params = new URLSearchParams(window.location.search);
	const state = params.get('state');
	if (!state || (!params.has('code') && !params.has('error'))) return false;
	const relay: Relay = {
		source: RELAY_SOURCE,
		state,
		code: params.get('code') ?? '',
		error: params.get('error') ?? '',
		errorDescription: params.get('error_description') ?? ''
	};
	if (window.opener) {
		(window.opener as Window).postMessage(relay, window.location.origin);
		window.close();
	}
	return true;
}

function waitForRelay(popup: Window): Promise<string> {
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			window.removeEventListener('message', onMessage);
			clearInterval(closedPoll);
		};
		const onMessage = (event: MessageEvent) => {
			if (event.origin !== window.location.origin) return;
			const data = event.data as Partial<Relay> | null;
			// GitHub Apps' web flow has no PKCE; `state` is the only CSRF check.
			if (data?.source !== RELAY_SOURCE || data.state !== sessionStorage.getItem(STATE_KEY)) return;
			cleanup();
			if (data.error === 'access_denied') reject(new Error('Sign-in was cancelled on GitHub.'));
			else if (data.error)
				reject(new Error(`GitHub refused the sign-in: ${data.errorDescription || data.error}.`));
			else if (!data.code) reject(new Error('GitHub returned no authorization code.'));
			else resolve(data.code);
		};
		const closedPoll = setInterval(() => {
			if (!popup.closed) return;
			cleanup();
			reject(new Error('The sign-in popup was closed before completing.'));
		}, 500);
		window.addEventListener('message', onMessage);
	});
}

async function askBroker(
	options: BrokerSessionOptions,
	path: string,
	body: Record<string, string>
): Promise<Grant> {
	let response: Response;
	try {
		response = await fetch(`${options.brokerOrigin.replace(/\/+$/, '')}${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({ client_id: options.clientId, ...body })
		});
	} catch {
		throw new Error('The GitHub sign-in service could not be reached.');
	}
	const answer = (await response.json().catch(() => ({}))) as Record<string, unknown>;
	// GitHub reports a refusal as `{ error, error_description }` with a 200.
	if (typeof answer.error === 'string' && answer.error) {
		const detail = typeof answer.error_description === 'string' ? answer.error_description : '';
		throw new Error(`GitHub refused the sign-in: ${detail || answer.error}.`);
	}
	if (!response.ok || typeof answer.access_token !== 'string' || !answer.access_token) {
		throw new Error(`The GitHub sign-in service sent an unexpected reply (${response.status}).`);
	}
	const now = Date.now();
	const after = (seconds: unknown) => (typeof seconds === 'number' ? now + seconds * 1000 : null);
	return {
		token: answer.access_token,
		expiresAt: after(answer.expires_in),
		refreshToken: typeof answer.refresh_token === 'string' ? answer.refresh_token : '',
		refreshExpiresAt: after(answer.refresh_token_expires_in)
	};
}

async function signInInPopup(options: BrokerSessionOptions): Promise<Grant> {
	const redirectUri = `${window.location.origin}${(options.basePath ?? '').replace(/\/+$/, '')}/uncial/`;
	const state = crypto.randomUUID();
	sessionStorage.setItem(STATE_KEY, state);
	const authorize = new URL('https://github.com/login/oauth/authorize');
	authorize.searchParams.set('client_id', options.clientId);
	authorize.searchParams.set('redirect_uri', redirectUri);
	authorize.searchParams.set('state', state);

	const popup = window.open(authorize, 'uncial-cms-broker', 'popup,width=640,height=760');
	if (!popup) {
		sessionStorage.removeItem(STATE_KEY);
		throw new Error('The sign-in popup was blocked; allow popups for this site.');
	}
	try {
		const code = await waitForRelay(popup);
		return await askBroker(options, '/github/token', { code, redirect_uri: redirectUri });
	} finally {
		sessionStorage.removeItem(STATE_KEY);
		if (!popup.closed) popup.close();
	}
}

async function github(token: string, path: string): Promise<Response> {
	return fetch(`${GITHUB_API_URL}${path}`, {
		headers: {
			Accept: 'application/vnd.github+json',
			Authorization: `Bearer ${token}`,
			'X-GitHub-Api-Version': '2022-11-28'
		}
	});
}

async function readUser(token: string): Promise<ForgeSession['user']> {
	const response = await github(token, '/user');
	if (!response.ok) throw new Error(`GitHub rejected the sign-in (${response.status}).`);
	const user = (await response.json()) as { login: string; id: number; name: string | null };
	return {
		login: user.login,
		name: user.name ?? user.login,
		email: `${user.id}+${user.login}@users.noreply.github.com`
	};
}

async function assertReachable(token: string, repo: string, appSlug: string): Promise<void> {
	const response = await github(token, `/repos/${repo}`);
	if (response.status === 404) {
		throw new Error(
			`The ${appSlug} GitHub App cannot reach ${repo} for this account. Install it at https://github.com/apps/${appSlug}/installations/new, or ask for access to the repository.`
		);
	}
	if (!response.ok) throw new Error(`GitHub rejected the sign-in (${response.status}).`);
}

/**
 * Signs in through a code-exchange broker holding a GitHub App's client
 * secret. The user-to-server token it returns is the forge's bearer, so GitHub
 * itself decides who may push. A refresh token, when the App issues one, is
 * kept in `localStorage` and renews the session without the popup.
 */
export function brokerSessionProvider(options: BrokerSessionOptions): SessionProvider {
	return async (config) => {
		const { repo } = config as GitHubSiteConfig;
		const remembered = readRefresh(repo);
		let grant: Grant | null = null;
		if (remembered) {
			grant = await askBroker(options, '/github/refresh', {
				refresh_token: remembered.refreshToken
			}).catch(() => null);
		}
		grant ??= await signInInPopup(options);
		writeRefresh(repo, grant);
		const user = await readUser(grant.token);
		await assertReachable(grant.token, repo, options.appSlug);
		return { token: grant.token, expiresAt: grant.expiresAt, repo, user };
	};
}
