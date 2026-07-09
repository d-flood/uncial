import { base } from '$app/paths';

// Uploaded images commit here (repo-root-relative). It lives under the app's
// `static/` dir so the built site serves each file from the site root, and it
// is the `mediaDir` handed to uncial-cms's uploadAsset. Keep it in sync with
// siteConfig.mediaDir (site.ts imports MEDIA_DIR to set exactly that).
export const MEDIA_DIR = 'packages/uncial-docs/static/uploads';

// Everything under this prefix is copied to the site root at build time, so a
// committed asset path maps to a served URL by dropping the prefix.
const STATIC_PREFIX = 'packages/uncial-docs/static';

/**
 * Map an uploadAsset repo path (`packages/uncial-docs/static/uploads/<hash>.png`)
 * to the URL the built site serves it from (`<base>/uploads/<hash>.png`). The
 * Image block stores this as its `src`; `base` is baked at build time.
 */
export function mediaSrcFromPath(repoPath: string): string {
	const rel = repoPath.startsWith(`${STATIC_PREFIX}/`)
		? repoPath.slice(STATIC_PREFIX.length)
		: `/${repoPath.replace(/^\/+/, '')}`;
	return `${base}${rel}`;
}
