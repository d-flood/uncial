import { defineSite } from 'uncial-cms';
import { siteOptions } from './site-options.ts';

export const site = defineSite(siteOptions, {
	blocks: [],
	meta: { title: { default: 'Untitled page', required: true } }
});
