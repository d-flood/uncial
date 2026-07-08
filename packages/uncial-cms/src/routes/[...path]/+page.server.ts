import { createContentHandlers } from '$lib/sveltekit/index.js';
import { blocks, localContentDir, schema, siteConfig } from '../site.js';

const handlers = createContentHandlers({ config: siteConfig, blocks, schema, localContentDir });

export const entries = handlers.entries;
export const load = handlers.load;
