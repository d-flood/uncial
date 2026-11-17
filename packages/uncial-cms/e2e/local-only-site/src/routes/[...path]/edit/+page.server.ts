import { editorRoutes } from 'uncial-cms/sveltekit';
import { site } from '../../site.js';

export const { entries, load } = editorRoutes(site);
