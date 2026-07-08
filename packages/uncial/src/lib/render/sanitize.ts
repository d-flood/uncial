const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

// Targets that reuse an existing browsing context and never hand the new page a
// window.opener; every other non-empty target (including named windows) does.
const OPENERLESS_TARGETS = new Set(['_self', '_parent', '_top']);

/**
 * Resolve the `rel` attribute for a rendered link: keeps any stored rel tokens
 * and guarantees `noopener` is present whenever the link opens a new browsing
 * context (`_blank` in any case variant, or a named window).
 */
export function resolveLinkRel(rel: unknown, target: string | undefined): string | null {
	const stored = typeof rel === 'string' ? rel.trim() : '';
	const tokens = stored ? stored.split(/\s+/) : [];
	const opensNewContext = Boolean(target) && !OPENERLESS_TARGETS.has(target!.toLowerCase());
	if (opensNewContext && !tokens.includes('noopener')) {
		tokens.push('noopener');
	}
	return tokens.length > 0 ? tokens.join(' ') : null;
}

export function sanitizeHref(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	// Protocol-relative URLs (`//host/...`) are NOT app-relative: they resolve to
	// another origin, so they must go through the protocol check below.
	if ((trimmed.startsWith('/') && !trimmed.startsWith('//')) || trimmed.startsWith('#'))
		return trimmed;

	try {
		const url = new URL(trimmed, 'https://uncial.local');
		return SAFE_PROTOCOLS.has(url.protocol) ? trimmed : null;
	} catch {
		return null;
	}
}
