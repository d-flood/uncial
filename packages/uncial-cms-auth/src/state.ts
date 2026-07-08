import { base64UrlDecode, base64UrlEncode, utf8 } from './encoding.js';

/**
 * Cross-request state for the stateless worker (spec D4 / ticket invariant 4):
 * everything the /token step must trust — repo, origin, PKCE challenge, issue
 * time — rides in an HMAC-SHA256-signed value the worker itself minted.
 */
export interface StatePayload {
	repo: string; // 'owner/name'
	origin: string; // initiating site origin
	challenge: string; // PKCE S256 challenge (base64url)
	iat: number; // epoch ms
}

async function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
		usage
	]);
}

export async function signState(payload: StatePayload, secret: string): Promise<string> {
	const body = base64UrlEncode(utf8(JSON.stringify(payload)));
	const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), utf8(body));
	return `${body}.${base64UrlEncode(signature)}`;
}

export async function verifyState(state: string, secret: string): Promise<StatePayload | null> {
	const [body, signature, ...rest] = state.split('.');
	if (!body || !signature || rest.length > 0) return null;

	let valid: boolean;
	let payload: unknown;
	try {
		valid = await crypto.subtle.verify(
			'HMAC',
			await hmacKey(secret, 'verify'),
			base64UrlDecode(signature),
			utf8(body)
		);
		payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
	} catch {
		return null;
	}
	if (!valid || typeof payload !== 'object' || payload === null) return null;

	const { repo, origin, challenge, iat } = payload as Partial<StatePayload>;
	if (
		typeof repo !== 'string' ||
		typeof origin !== 'string' ||
		typeof challenge !== 'string' ||
		typeof iat !== 'number'
	) {
		return null;
	}
	return { repo, origin, challenge, iat };
}
