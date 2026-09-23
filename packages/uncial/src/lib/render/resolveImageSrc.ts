/**
 * Applies a SvelteKit-style `base` (`''` or `/sub`) to a root-relative image `src`.
 * Anything else — `blob:` editor previews, `data:` URIs, protocol-relative and
 * absolute URLs, relative paths — is already displayable and passes through.
 */
export function resolveImageSrc(src: string, base: string): string {
	if (!src.startsWith('/') || src.startsWith('//')) return src;
	return base.replace(/\/+$/, '') + src;
}
