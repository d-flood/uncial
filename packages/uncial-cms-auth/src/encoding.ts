const encoder = new TextEncoder();

export function utf8(value: string): Uint8Array {
	return encoder.encode(value);
}

export function base64UrlEncode(bytes: Uint8Array | ArrayBuffer): string {
	const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
	let binary = '';
	for (const byte of view) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function base64UrlDecode(value: string): Uint8Array {
	const padded = value.replaceAll('-', '+').replaceAll('_', '/');
	const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function sha256Base64Url(value: string): Promise<string> {
	return base64UrlEncode(await crypto.subtle.digest('SHA-256', utf8(value)));
}

export function pemToBytes(pem: string): Uint8Array {
	const body = pem.replace(/-----(BEGIN|END)[A-Z ]+-----/g, '').replace(/\s+/g, '');
	return Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
}
