import type { SessionProvider } from '../types.js';

function base64UrlEncode(bytes: Uint8Array | ArrayBuffer): string {
	const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
	let binary = '';
	for (const byte of view) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

interface RelayedAuth {
	code: string;
	state: string;
}

function waitForRelay(workerOrigin: string, popup: Window): Promise<RelayedAuth> {
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			window.removeEventListener('message', onMessage);
			clearInterval(closedPoll);
		};
		const onMessage = (event: MessageEvent) => {
			if (event.origin !== workerOrigin) return;
			const data = event.data as Partial<RelayedAuth> & { source?: string };
			if (
				data?.source !== 'uncial-cms-auth' ||
				typeof data.code !== 'string' ||
				typeof data.state !== 'string'
			) {
				return;
			}
			cleanup();
			resolve({ code: data.code, state: data.state });
		};
		const closedPoll = setInterval(() => {
			if (popup.closed) {
				cleanup();
				reject(new Error('The sign-in popup was closed before completing.'));
			}
		}, 500);
		window.addEventListener('message', onMessage);
	});
}

/**
 * Default session provider (issue 03): opens the auth worker in a popup with a
 * PKCE challenge, waits for the worker's callback page to relay {code, state},
 * then finishes the exchange at POST /token. The verifier never leaves this
 * page, and the token that comes back is an installation token scoped to the
 * one configured repository.
 */
export const popupSessionProvider: SessionProvider = async (config) => {
	if (!config.authWorkerUrl) {
		throw new Error(
			'config.authWorkerUrl is not set; configure the auth worker or use patSessionProvider.'
		);
	}
	const workerBase = config.authWorkerUrl.replace(/\/+$/, '');
	const workerOrigin = new URL(workerBase).origin;

	const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
	const challenge = base64UrlEncode(
		await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
	);

	const authUrl = new URL(`${workerBase}/auth`);
	authUrl.searchParams.set('repo', config.repo);
	authUrl.searchParams.set('origin', window.location.origin);
	authUrl.searchParams.set('challenge', challenge);

	const popup = window.open(authUrl.toString(), 'uncial-cms-auth', 'popup,width=640,height=760');
	if (!popup) throw new Error('The sign-in popup was blocked; allow popups for this site.');

	const { code, state } = await waitForRelay(workerOrigin, popup);

	const response = await fetch(`${workerBase}/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ code, state, verifier })
	});
	if (!response.ok) {
		const { error } = (await response.json().catch(() => ({}))) as { error?: string };
		throw new Error(`Sign-in failed (${error ?? response.status}).`);
	}

	const session = (await response.json()) as {
		token: string;
		expiresAt: number;
		repo: string;
		user: { login: string; name: string; email: string };
	};
	return {
		token: session.token,
		expiresAt: session.expiresAt,
		repo: session.repo,
		user: session.user
	};
};
