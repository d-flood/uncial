import { createIndexHandlers } from '$lib/sveltekit/index.js';
import { blocks, schema, siteConfig } from '../site.js';

const handlers = createIndexHandlers({ config: siteConfig, blocks, schema });

export const load = handlers.load;
