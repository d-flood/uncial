export function encodeBase64(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

export function decodeBase64(base64: string): string {
	// The Contents API wraps base64 payloads in newlines.
	const binary = atob(base64.replaceAll('\n', ''));
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}
