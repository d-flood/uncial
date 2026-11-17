import { describe, expect, it } from 'vitest';

const valueExports = async (entry: Promise<Record<string, unknown>>) =>
	Object.keys(await entry).sort();

describe('public api', () => {
	it('exports exactly the documented names from each entry point', async () => {
		expect(await valueExports(import('./lib/index.js'))).toEqual([
			'ConflictError',
			'FileTooLargeError',
			'MediaInUseError',
			'NotFoundError',
			'buildNav',
			'defineServerSite',
			'defineSite',
			'loadCollection',
			'loadGlobal',
			'mediaSourceFor'
		]);
		expect(await valueExports(import('./lib/svelte/index.js'))).toEqual([
			'Dashboard',
			'EditorPage',
			'MediaLibrary',
			'Page'
		]);
		expect(await valueExports(import('./lib/sveltekit/index.js'))).toEqual([
			'contentRoutes',
			'editorRoutes'
		]);
		expect(await valueExports(import('./lib/astro/index.js'))).toEqual([
			'contentRoutes',
			'editorRoutes',
			'uncialCms'
		]);
		expect(await valueExports(import('./lib/astro/editor.js'))).toEqual(['EditorSurface']);
		expect(await valueExports(import('./lib/vite/index.js'))).toEqual(['uncialCms']);
		expect(await valueExports(import('./lib/server/index.js'))).toEqual([
			'MediaInUseError',
			'contentStoreMigrations',
			'createMediaLibrary',
			'createPostgresContentStore',
			'createServerContentHandlers',
			'createServerMediaHandlers',
			'mediaLibraryMigrations'
		]);
		expect(await valueExports(import('./lib/elements.js'))).toEqual([
			'UncialDashboardElement',
			'UncialEditorPageElement'
		]);
	});
});
