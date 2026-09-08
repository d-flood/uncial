/**
 * Map a committed repo path to the URL the built site serves it from.
 */
import type { Site } from './define-site.js';

/**
 * Everything under the site's static directory is copied to the site root at
 * build time, so a committed asset path becomes a served URL by dropping that
 * prefix. `staticDir` is repo-root-relative, like `mediaDir`; a `mediaDir` that
 * does not sit under it is not served by the copy, so the path is returned
 * site-root-absolute unchanged.
 *
 * The result carries no base path: a stored `src` must stay correct at every
 * `paths.base` the same content is built at, so the site prepends its base at
 * render time.
 */
export function servedUrl(site: Site, repoPath: string, staticDir = 'static'): string {
	const prefix = `${staticDir.replace(/\/+$/, '')}/`;
	const mediaDir = site.config.mediaDir;
	if (mediaDir?.startsWith(prefix) && repoPath.startsWith(prefix)) {
		return repoPath.slice(prefix.length - 1);
	}
	return `/${repoPath.replace(/^\/+/, '')}`;
}
