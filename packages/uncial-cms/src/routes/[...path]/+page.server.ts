import { contentRoutes } from '$lib/sveltekit/index.js';
import { site } from '../site.js';

export const { entries, load } = contentRoutes(site);
