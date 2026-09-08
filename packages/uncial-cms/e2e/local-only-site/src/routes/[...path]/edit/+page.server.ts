import { createEditorHandlers } from 'uncial-cms/sveltekit';
import { blocks, schema, site } from '../../site.js';

const handlers = createEditorHandlers({ site, blocks, schema });

export const entries = handlers.entries;
export const load = handlers.load;
