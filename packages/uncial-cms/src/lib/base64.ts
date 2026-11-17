const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let start = 0; start < bytes.length; start += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK));
	}
	return btoa(binary);
}

export function decodeBase64(base64: string): string {
	// The Contents API wraps base64 payloads in newlines.
	const binary = atob(base64.replaceAll('\n', ''));
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}
