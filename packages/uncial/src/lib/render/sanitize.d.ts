/**
 * Resolve the `rel` attribute for a rendered link: keeps any stored rel tokens
 * and guarantees `noopener` is present whenever the link opens a new browsing
 * context (`_blank` in any case variant, or a named window).
 */
export declare function resolveLinkRel(rel: unknown, target: string | undefined): string | null;
export declare function sanitizeHref(value: unknown): string | null;
