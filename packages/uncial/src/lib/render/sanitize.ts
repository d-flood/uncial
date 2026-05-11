const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function sanitizeHref(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed;

	try {
		const url = new URL(trimmed, 'https://uncial.local');
		return SAFE_PROTOCOLS.has(url.protocol) ? trimmed : null;
	} catch {
		return null;
	}
}
