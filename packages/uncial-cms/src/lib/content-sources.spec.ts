import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, expectTypeOf, it } from 'vitest';
import { createBlockRegistry, createSchema } from 'uncial/core';
import { loadGlobal } from './content-sources.js';
import { defineServerSite, defineSite } from './define-site.js';

interface Link {
	label: string;
	href: string;
}

const blocks = createBlockRegistry([]);
const menus = createSchema(blocks, {
	metaFields: {
		footerText: { default: 'Made with Uncial' },
		header: { default: [] as Link[], list: { fields: { label: '', href: '' } } }
	}
});
const banner = createSchema(blocks, {
	metaFields: { text: { default: '' }, enabled: { default: false } }
});
const globals = { menus, banner };

const savedMenus = {
	type: 'doc',
	version: 1,
	content: [],
	meta: { header: [{ label: 'Home', href: '/' }], retired: true }
};

const localContentDir = mkdtempSync(join(tmpdir(), 'uncial-cms-globals-'));
mkdirSync(join(localContentDir, '_globals'));
writeFileSync(join(localContentDir, '_globals/menus.json'), JSON.stringify(savedMenus));
afterAll(() => rmSync(localContentDir, { recursive: true, force: true }));

const staticSite = defineSite({ contentDir: 'content', localContentDir, globals }, { dev: false });
const serverSite = defineServerSite({ apiBase: '/api/content', globals });
const store = {
	get: async (path: string) => (path === '/_globals/menus/' ? { published: savedMenus } : null)
};

type Name = keyof typeof globals;

describe.each([
	{
		label: 'a static site, from its content dir',
		load: (name: Name) => loadGlobal(staticSite, name)
	},
	{
		label: 'a server site, from its store',
		load: (name: Name) => loadGlobal(serverSite, name, { store })
	}
])('loadGlobal on $label', ({ load }) => {
	it('returns the schema defaults for a Global never saved', async () => {
		expect(await load('banner')).toEqual({ text: '', enabled: false });
	});

	it('returns a saved Global normalized against its schema', async () => {
		expect(await load('menus')).toEqual({
			footerText: 'Made with Uncial',
			header: [{ label: 'Home', href: '/' }]
		});
	});
});

describe('loadGlobal typing', () => {
	it("types the value from the Global's schema", async () => {
		const value = await loadGlobal(staticSite, 'menus');
		expectTypeOf(value).toEqualTypeOf<{ footerText: string; header: Link[] }>();
		expectTypeOf(await loadGlobal(serverSite, 'banner', { store })).toEqualTypeOf<{
			text: string;
			enabled: boolean;
		}>();
		// @ts-expect-error the site declares no Global by that name
		void (() => loadGlobal(staticSite, 'footer'));
		expect(value.header.map((link) => link.href)).toEqual(['/']);
	});
});
