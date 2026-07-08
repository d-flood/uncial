import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContentHandlers, defaultMapSourceToPath } from 'uncial-cms/sveltekit';
import { buildDocsNav, type DocPage } from '$lib/nav.js';
import { blocks, localContentDir, schema, siteConfig } from '../site.js';

const handlers = createContentHandlers({ config: siteConfig, blocks, schema, localContentDir });

/**
 * Read every Content document's meta at prerender time so the sidebar can be
 * built from content, not code. The per-page `load` already returns one page's
 * meta; the sidebar needs all of them, so we walk the content dir directly
 * (node:fs, server-only — this module is never bundled to the client).
 */
function listDocPages(): DocPage[] {
	const pages: DocPage[] = [];
	const walk = (rel: string): void => {
		for (const entry of readdirSync(join(localContentDir, rel), { withFileTypes: true })) {
			const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
			if (entry.isDirectory()) walk(childRel);
			else if (entry.isFile() && entry.name.endsWith('.json')) {
				const raw = readFileSync(join(localContentDir, childRel), 'utf-8');
				const meta = (JSON.parse(raw) as { meta?: Record<string, unknown> }).meta ?? {};
				pages.push({
					path: defaultMapSourceToPath(
						`${siteConfig.contentDir}/${childRel}`,
						siteConfig.contentDir
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

export const entries = handlers.entries;

export const load = async (event: { params: { path: string } }) => {
	const page = await handlers.load(event);
	return { ...page, path: event.params.path, nav: buildDocsNav(listDocPages()) };
};
