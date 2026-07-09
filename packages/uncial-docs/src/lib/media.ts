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
 * to the site-root-relative URL the built site serves it from
 * (`/uploads/<hash>.png`). The Image block stores this base-less value as its
 * `src` so the same content builds correctly at any `paths.base` (the plain e2e
 * build and the `/uncial/docs` production build). `base` is applied at render
 * time via {@link withBase}, not baked into the stored src.
 */
export function mediaSrcFromPath(repoPath: string): string {
	return repoPath.startsWith(`${STATIC_PREFIX}/`)
		? repoPath.slice(STATIC_PREFIX.length)
		: `/${repoPath.replace(/^\/+/, '')}`;
}

/**
 * Prepend the build-time `paths.base` to a site-root-relative media src so it
 * resolves under a project-site base (e.g. `/uncial/docs/uploads/x.png`).
 * Left untouched are blob:/data:/absolute URLs, which are already resolvable.
 */
export function withBase(src: string): string {
	return src.startsWith('/') ? `${base}${src}` : src;
}
