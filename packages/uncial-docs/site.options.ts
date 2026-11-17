// The docs site's CMS declaration, in a module with no Svelte and no Kit in its
// graph so that both the app (src/routes/site.ts) and vite.config.ts can import it.
import type { SiteOptions } from 'uncial-cms';

// This app edits the repository it lives in: saves commit to
// packages/uncial-docs/content/docs/ on main, and the canonical auth worker and
// GitHub App are the defaults, so the GitHub half is a repo and a branch.
export const siteOptions: SiteOptions = {
	contentDir: 'packages/uncial-docs/content/docs',
	// FS location of the content dir at build time, relative to the package root
	// (vite runs from there). `contentDir` is the same dir repo-root-relative.
	localContentDir: 'content/docs',
	staticDir: 'packages/uncial-docs/static',
	mediaDir: 'packages/uncial-docs/static/uploads',
	github: { repo: 'd-flood/uncial', branch: 'main' },
	autosaveMs: 400
};
