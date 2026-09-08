import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultMapSourceToPath } from 'uncial-cms/sveltekit';
import { buildDocsNav, type DocPage } from '$lib/nav.js';
import { site } from '../site.js';

/**
 * Read every Content document's meta at prerender time so the sidebar can be
 * built from content, not code. The per-page `load` already returns one page's
 * meta; the sidebar needs all of them, so we walk the content dir directly
 * (node:fs, server-only — this module is never bundled to the client).
 */
function listDocPages(): DocPage[] {
	const pages: DocPage[] = [];
	const walk = (rel: string): void => {
		for (const entry of readdirSync(join(site.localContentDir, rel), { withFileTypes: true })) {
			const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
			if (entry.isDirectory()) walk(childRel);
			else if (entry.isFile() && entry.name.endsWith('.json')) {
				const raw = readFileSync(join(site.localContentDir, childRel), 'utf-8');
				const meta = (JSON.parse(raw) as { meta?: Record<string, unknown> }).meta ?? {};
				pages.push({
					path: defaultMapSourceToPath(
						`${site.config.contentDir}/${childRel}`,
						site.config.contentDir
					),
					meta: {
						title: typeof meta.title === 'string' ? meta.title : 'Untitled page',
						navGroup: typeof meta.navGroup === 'string' ? meta.navGroup : undefined,
						navOrder: typeof meta.navOrder === 'number' ? meta.navOrder : undefined
					}
				});
			}
		}
	};
	walk('');
	return pages;
}

export const load = () => ({ nav: buildDocsNav(listDocPages()) });
