function normalizeSitePath(sitePath: string): string {
	return sitePath.replace(/^\/+/, '').replace(/\/+$/, '');
}

function contentDirForLocale(contentDir: string, locale: string): string {
	return locale === 'en' ? contentDir : `${contentDir}/${locale}`;
}

/** Site-relative URL path (base already stripped) → repo-root-relative JSON path. */
export function defaultMapPathToSource(
	sitePath: string,
	contentDir: string,
	locale = 'en'
): string {
	const path = normalizeSitePath(sitePath);
	return `${contentDirForLocale(contentDir, locale)}/${path === '' ? 'index' : path}.json`;
}

/** Repo-root-relative JSON path → site-relative URL path (no leading/trailing slash). */
export function defaultMapSourceToPath(source: string, contentDir: string, locale = 'en'): string {
	const prefix = `${contentDirForLocale(contentDir, locale)}/`;
	if (!source.startsWith(prefix) || !source.endsWith('.json')) {
		throw new Error(`Source "${source}" is not a JSON file under "${contentDir}".`);
	}
	const path = source.slice(prefix.length, -'.json'.length);
	return path === 'index' ? '' : path;
}

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
