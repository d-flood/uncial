import { base64UrlEncode, pemToBytes, utf8 } from './encoding.js';

/**
 * GitHub App JWT (RS256), used for app-to-server calls: resolving the repo's
 * installation and minting the scoped installation token. The private key must
 * be PKCS#8 PEM (WebCrypto cannot import GitHub's default PKCS#1 download;
 * convert once with `openssl pkcs8 -topk8 -nocrypt` — see the README).
 */
export async function appJwt(appId: string, privateKeyPem: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'pkcs8',
		pemToBytes(privateKeyPem),
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['sign']
	);

	const now = Math.floor(Date.now() / 1000);
	const header = base64UrlEncode(utf8(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
	// iat backdated 60s for clock drift; 9-minute expiry (GitHub caps at 10).
	const payload = base64UrlEncode(
		utf8(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }))
	);
	const signature = await crypto.subtle.sign(
		'RSASSA-PKCS1-v1_5',
		key,
		utf8(`${header}.${payload}`)
	);
	return `${header}.${payload}.${base64UrlEncode(signature)}`;
}
