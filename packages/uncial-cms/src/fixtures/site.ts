// A Site object as a site declares one: Block modules, meta fields and a lazily
// loaded attribute input. A local site serving `public/` under `/brand`.
import { defineSite } from '../lib/index.js';
import * as note from './Note.svelte';

export const site = defineSite(
	{ contentDir: 'content', staticDir: 'public', mediaDir: 'public/assets' },
	{
		base: '/brand',
		blocks: { note },
		meta: {
			attachment: { default: null, input: 'file' },
			pick: { default: '', input: 'pick' }
		},
		editor: { attributeInputs: { pick: () => import('./PickInput.svelte') } }
	}
);
