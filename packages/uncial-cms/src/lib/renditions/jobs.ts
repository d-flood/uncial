/**
 * The rendition jobs a site's content declares. The Vite plugin loads this
 * module through the site's own SSR module graph, beside the site module.
 */
import { loadCollection } from '../collections.js';
import { loadGlobal } from '../globals.js';
import type { Site } from '../define-site.js';
import { contentSource } from '../routes.js';
import { collectRenditions, type RenditionJob } from './build.js';

/** Every job of every Content document, Global and Collection record, read from the local content. */
export async function renditionJobs(site: Site): Promise<RenditionJob[]> {
	const jobs = contentSource(site)
		.list()
		.flatMap((page) =>
			collectRenditions(page.document, site.blocks, site.schemaFor(page.meta).metaFields)
		);
	for (const [name, global] of Object.entries(site.globals)) {
		jobs.push(
			...collectRenditions({ meta: await loadGlobal(site, name) }, site.blocks, global.meta)
		);
	}
	for (const [name, collection] of Object.entries(site.collections)) {
		for (const record of await loadCollection(site, name)) {
			jobs.push(...collectRenditions(record, site.blocks, collection.meta));
		}
	}
	return jobs;
}
