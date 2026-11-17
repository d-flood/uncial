/**
 * Map a committed repo path to the URL the built site serves it from.
 */
import type { Site } from './define-site.js';
import { configMediaDir, configMediaUrlPrefix } from './upload-context.js';

const trimSlashes = (path: string) => path.replace(/^\/+|\/+$/g, '');

/**
 * A site with a `mediaUrlPrefix` serves `mediaDir` under that prefix wherever
 * the directory lives, e.g. on a content branch. Otherwise everything under the
 * site's static directory is copied to the site root at build time, so a
 * committed asset path becomes a served URL by dropping that prefix.
 * `staticDir` is repo-root-relative, like `mediaDir`; a `mediaDir` that does not
 * sit under it is not served by the copy, so the path is returned
 * site-root-absolute unchanged.
 *
 * The result carries no base path: a stored `src` must stay correct at every
 * `paths.base` the same content is built at, so the site prepends its base at
 * render time.
 */
export function servedUrl(
	site: Pick<Site, 'config'> & { staticDir?: string },
	repoPath: string,
	staticDir = site.staticDir ?? 'static'
): string {
	const mediaDir = configMediaDir(site.config);
	const urlPrefix = configMediaUrlPrefix(site.config);
	const path = repoPath.replace(/^\/+/, '');
	if (mediaDir !== undefined && urlPrefix !== undefined) {
		const dir = `${trimSlashes(mediaDir)}/`;
		if (path.startsWith(dir)) {
			return `/${[trimSlashes(urlPrefix), path.slice(dir.length)].filter(Boolean).join('/')}`;
		}
	}
	const prefix = `${staticDir.replace(/\/+$/, '')}/`;
	if (mediaDir?.startsWith(prefix) && repoPath.startsWith(prefix)) {
		return repoPath.slice(prefix.length - 1);
	}
	return `/${path}`;
}
