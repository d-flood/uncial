// Plain data, so astro.config.ts and the reader routes can import it.
import type { SiteOptions } from 'uncial-cms';

export const siteOptions = {
	contentDir: 'content',
	github: { repo: 'uncial-fixture/site', branch: 'main' }
} satisfies SiteOptions;
