// The one site declaration, in a module with no Svelte and no Kit in its graph
// so that both the app (src/routes/site.ts) and vite.config.ts can import it.
import type { SiteOptions } from 'uncial-cms';

/** Everything under this dir is copied to the site root, which is what `servedUrl` strips. */
export const STATIC_DIR = 'static';

// A GitHub half is declared so the production build resolves the GitHub forge:
// the Editor variants prerender, and the default gate mode is the one exercised.
export const siteOptions: SiteOptions = {
	contentDir: 'content',
	mediaDir: `${STATIC_DIR}/uploads`,
	github: { repo: 'uncial-smoke/site', branch: 'main' }
};
