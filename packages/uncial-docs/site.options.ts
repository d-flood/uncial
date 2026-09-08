// The docs site's CMS declaration, in a module with no Svelte and no Kit in its
// graph so that both the app ($lib/site.ts) and vite.config.ts can import it.
import type { SiteOptions } from 'uncial-cms';

// Everything under this dir is copied to the site root at build time, so
// `servedUrl` maps a committed asset path to its served URL by dropping it.
export const STATIC_DIR = 'packages/uncial-docs/static';

// This app edits the repository it lives in: saves commit to
// packages/uncial-docs/content/docs/ on main, and the canonical auth worker and
// GitHub App are the defaults, so the GitHub half is a repo and a branch.
export const siteOptions: SiteOptions = {
	contentDir: 'packages/uncial-docs/content/docs',
	// FS location of the content dir at build time, relative to the package root
	// (vite runs from there). `contentDir` is the same dir repo-root-relative.
	localContentDir: 'content/docs',
	mediaDir: `${STATIC_DIR}/uploads`,
	github: { repo: 'd-flood/uncial', branch: 'main' },
	autosaveMs: 400
};
