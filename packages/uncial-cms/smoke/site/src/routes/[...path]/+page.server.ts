import { servedUrl } from 'uncial-cms';
import { createContentHandlers } from 'uncial-cms/sveltekit';
import { blocks, schema, site, STATIC_DIR } from '../site.js';

const handlers = createContentHandlers({ site, blocks, schema });

export const entries = handlers.entries;

export const load = async (event: { params: { path: string } }) => ({
	...(await handlers.load(event)),
	// A committed media path becomes the URL the built site serves; the site
	// prepends its own base at render time.
	banner: servedUrl(site, `${STATIC_DIR}/uploads/banner.svg`, STATIC_DIR)
});
