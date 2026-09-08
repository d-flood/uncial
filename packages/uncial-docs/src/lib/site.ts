// The docs site object: this app edits this repository itself, so saves commit
// to packages/uncial-docs/content/docs/ on main. It reuses the existing
// repo-scoped auth worker unchanged (d-flood.github.io is already allowlisted),
// proving a second real site can adopt the shipped CMS with only build-time
// config. Blocks and schema live in src/routes/site.ts, which re-exports the
// pieces the route factories take; keeping the object here leaves it importable
// from a block without a cycle back through the block registry.
import type { Site } from 'uncial-cms';

// Everything under this dir is copied to the site root at build time, so
// `servedUrl` maps a committed asset path to its served URL by dropping it.
export const STATIC_DIR = 'packages/uncial-docs/static';

// The docs migration slice replaces this literal with `defineSite`.
export const site: Site = {
	config: {
		forge: 'github',
		repo: 'd-flood/uncial',
		branch: 'main',
		contentDir: 'packages/uncial-docs/content/docs',
		authWorkerUrl: 'https://uncial-cms-auth.dflood.workers.dev',
		appSlug: 'uncial-cms',
		mediaDir: `${STATIC_DIR}/uploads`
	},
	localOnly: false,
	autosaveMs: undefined,
	// FS location of the content dir at build time, relative to the package root
	// (vite runs from there). config.contentDir is the same dir repo-root-relative.
	localContentDir: 'content/docs'
};
