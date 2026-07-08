/**
 * Page-path validation and hash routing for the `/uncial/` index.
 * Paths are stored without leading/trailing slashes; the fallback editor
 * addresses them as `#/<path>/` (the empty path — the site root — is `#/`).
 */

const SEGMENT = /^[a-z0-9-]+$/;

export type PagePathValidation = { ok: true; path: string } | { ok: false; message: string };

/** Validate a user-typed page path; strips surrounding whitespace and slashes. */
export function validatePagePath(input: string): PagePathValidation {
	const path = input.trim().replace(/^\/+/, '').replace(/\/+$/, '');
	if (path === '') {
		return { ok: false, message: 'Enter a page path, e.g. team/new-page.' };
	}
	if (!path.split('/').every((segment) => SEGMENT.test(segment))) {
		return {
			ok: false,
			message:
				'Page paths must be lowercase segments of letters, digits, and hyphens separated by "/", e.g. team/new-page.'
		};
	}
	return { ok: true, path };
}

/** `'about'` → `'#/about/'`; the site root (`''`) → `'#/'`. */
export function hashForPagePath(path: string): string {
	return path === '' ? '#/' : `#/${path}/`;
}

/** `'#/about/'` → `'about'`; `'#/'` → `''` (site root); no hash → null (list view). */
export function pagePathFromHash(hash: string): string | null {
	if (hash === '' || hash === '#') return null;
	if (!hash.startsWith('#/')) return null;
	return hash.slice(2).replace(/\/+$/, '');
}
