import { createIndexHandlers } from 'uncial-cms/sveltekit';
import { blocks, schema, site } from '../site.js';

const handlers = createIndexHandlers({ site, blocks, schema });

export const load = handlers.load;
