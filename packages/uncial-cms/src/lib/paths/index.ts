function normalizeSitePath(sitePath: string): string {
	return sitePath.replace(/^\/+/, '').replace(/\/+$/, '');
}

/** Site-relative URL path (base already stripped) → repo-root-relative JSON path. */
export function defaultMapPathToSource(sitePath: string, contentDir: string): string {
	const path = normalizeSitePath(sitePath);
	return `${contentDir}/${path === '' ? 'index' : path}.json`;
}

/** Repo-root-relative JSON path → site-relative URL path (no leading/trailing slash). */
export function defaultMapSourceToPath(source: string, contentDir: string): string {
	const prefix = `${contentDir}/`;
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
