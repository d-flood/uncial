import { sveltekit } from '@sveltejs/kit/vite';
import { uncialCms } from 'uncial-cms/vite';
import { defineConfig } from 'vite';
import { siteOptions } from './site.options.js';

export default defineConfig({
	plugins: [...uncialCms(siteOptions), sveltekit()]
});
