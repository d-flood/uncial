import { contentRoutes } from 'uncial-cms/sveltekit';
import { site } from '../site.js';

export const { entries, load } = contentRoutes(site);
