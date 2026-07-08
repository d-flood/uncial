/**
 * Default URL↔source mapping (PRD §6.1): site-relative `/about/` maps to
 * `<contentDir>/about.json`; nested paths map naturally. The site root (`/`)
 * maps to `<contentDir>/index.json`.
 *
 * Pure functions: the index route reuses `defaultMapPathToSource` at runtime
 * in the browser, so nothing here may touch the filesystem.
 */

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
