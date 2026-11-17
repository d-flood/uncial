import { editorRoutes } from '$lib/sveltekit/index.js';
import { site } from '../../site.js';

export const { entries, load } = editorRoutes(site);
