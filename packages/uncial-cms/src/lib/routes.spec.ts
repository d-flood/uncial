import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import * as astro from './astro/index.js';
import { loadCollection } from './collections.js';
import { loadGlobal } from './globals.js';
import { defineServerSite, defineSite } from './define-site.js';
import * as sveltekit from './sveltekit/index.js';

const root = mkdtempSync(join(tmpdir(), 'uncial-cms-routes-'));
const dir = join(root, 'content');
const write = (rel: string, title: string, meta: object = { title }) => {
	mkdirSync(join(dir, rel, '..'), { recursive: true });
	writeFileSync(join(dir, rel), JSON.stringify({ type: 'doc', meta, content: [] }));
};
write('index.json', 'Home');
write('about.json', 'About');
write('guide/start.json', 'Start');
write('settings.json', 'Settings');
write('_globals/menus.json', '', { header: [{ label: 'Home', href: '/' }], retired: true });
write('people/lovelace.json', '', { name: 'Ada', born: 1815, retired: true });
write('people/babbage.json', '', { name: 'Charles' });
afterAll(() => rmSync(root, { recursive: true, force: true }));
afterEach(() => vi.unstubAllEnvs());

interface Link {
	label: string;
	href: string;
}
const github = { repo: 'uncial-fixture/site', branch: 'main' };
const meta = { title: { default: 'Untitled page', required: true } };
const globals = {
	menus: {
		label: 'Menus',
		meta: {
			footerText: { default: 'Made with Uncial' },
			header: { default: [] as Link[], list: { fields: { label: '', href: '' } } }
		}
	},
	banner: { meta: { text: { default: '' }, enabled: { default: false } } }
};
const people = { meta: { name: { default: '' }, born: { default: null as number | null } } };
const site = defineSite(
	{
		contentDir: 'content',
		localContentDir: dir,
		github,
		globals,
		collections: { people: { ...people, dir: 'content/people' } }
	},
	{ blocks: [], meta }
);
const localOnly = defineSite({ contentDir: 'content', localContentDir: dir }, { blocks: [] });
// `settings.json` stands in for the non-page files every real content dir holds.
const exclude = (entry: { path: string }) => entry.path === 'settings';
const pages = ['about', 'guide/start', ''];

const status = (promise: Promise<unknown>) =>
	promise.then(
		() => 200,
		(e) => e.status
	);

describe('SvelteKit contentRoutes and editorRoutes', () => {
	const content = sveltekit.contentRoutes(site, { exclude });
	const editor = sveltekit.editorRoutes(site, { exclude });

	it('route every page, and no Global, Collection record or excluded file', () => {
		expect(content.entries().map(({ path }) => path)).toEqual(pages);
		expect(editor.entries()).toEqual(content.entries());
	});

	it('load a page by any spelling of its path, typed by the meta fields', async () => {
		const data = await content.load({ params: { path: '/guide/start/' } });
		expect(data).toMatchObject({ path: 'guide/start', meta: { title: 'Start' } });
		expectTypeOf(data.meta.title).toEqualTypeOf<string>();
		expect((await content.load({ params: { path: '/' } })).path).toBe('');
		await expect(editor.load({ params: { path: 'about/' } })).resolves.toEqual({
			sourcePath: 'content/about.json',
			pagePath: 'about'
		});
	});

	it('404 an unknown, excluded, Global or Collection path', async () => {
		for (const path of ['nope', 'settings', '_globals/menus', 'people/lovelace']) {
			expect(await status(content.load({ params: { path } }))).toBe(404);
			expect(await status(editor.load({ params: { path } }))).toBe(404);
		}
	});

	it('prerender no editor routes for a local-only site outside development', () => {
		vi.stubEnv('DEV', false);
		expect(sveltekit.editorRoutes(localOnly).entries()).toEqual([]);
	});

	it('memoize listings outside development and re-read them in development', () => {
		vi.stubEnv('DEV', false);
		const built = sveltekit.contentRoutes(site, { exclude });
		expect(built.list()).toBe(built.list());
		write('late.json', 'Late');
		expect(built.entries().map(({ path }) => path)).toEqual(pages);
		vi.stubEnv('DEV', true);
		expect(built.entries().map(({ path }) => path)).toContain('late');
		rmSync(join(dir, 'late.json'));
	});
});

describe('Astro contentRoutes and editorRoutes', () => {
	const content = astro.contentRoutes(site, { exclude });

	it('hand each static path its normalized document, root as undefined', () => {
		const paths = content.getStaticPaths();
		expect(paths.map(({ params }) => params.path)).toEqual(['about', 'guide/start', undefined]);
		expect(paths[1]!.props).toMatchObject({
			sourcePath: 'content/guide/start.json',
			meta: { title: 'Start' }
		});
	});

	it('load a page by any spelling of its path, and nothing for an unknown one', () => {
		expect(content.load('/about/')?.path).toBe('about');
		for (const path of ['nope', 'settings', '_globals/menus', 'people/lovelace']) {
			expect(content.load(path)).toBeUndefined();
		}
	});

	it('prerender no editor routes for a local-only site outside development', () => {
		vi.stubEnv('DEV', false);
		expect(astro.editorRoutes(localOnly).getStaticPaths()).toEqual([]);
	});
});

const serverSite = defineServerSite(
	{ apiBase: '/api/content', globals, collections: { people: { ...people, dir: 'people' } } },
	{ blocks: [] }
);
const published = (path: string, meta: object) => ({ path, published: { type: 'doc', meta } });
const store = {
	get: async (path: string) =>
		path === '/_globals/menus/'
			? published(path, { header: [{ label: 'Home', href: '/' }] })
			: null,
	list: async () => [
		published('/people/lovelace/', { name: 'Ada', born: 1815, retired: true }),
		published('/people/babbage/', { name: 'Charles' }),
		published('/about/', { title: 'About' })
	]
};

describe.each([
	{ label: 'a static site, from disk', load: () => [site, {}] as const },
	{ label: 'a server site, from its store', load: () => [serverSite, { store }] as const }
])('loadGlobal and loadCollection on $label', ({ load }) => {
	const [target, opts] = load();

	it('normalize a Global against its fields, defaults for one never saved', async () => {
		expect(await loadGlobal(target, 'menus', opts)).toEqual({
			footerText: 'Made with Uncial',
			header: [{ label: 'Home', href: '/' }]
		});
		expect(await loadGlobal(target, 'banner', opts)).toEqual({ text: '', enabled: false });
	});

	it('read every Collection record, normalized and sorted by slug', async () => {
		expect(await loadCollection(target, 'people', opts)).toEqual([
			{ slug: 'babbage', meta: { name: 'Charles', born: null } },
			{ slug: 'lovelace', meta: { name: 'Ada', born: 1815 } }
		]);
	});
});

it('types Global values and Collection records from their meta fields', async () => {
	expectTypeOf(await loadGlobal(site, 'menus')).toEqualTypeOf<{
		footerText: string;
		header: Link[];
	}>();
	const [record] = await loadCollection(serverSite, 'people', { store });
	expectTypeOf(record!.meta).toEqualTypeOf<{ name: string; born: number | null }>();
	expect(record!.meta.born).toBeNull();
	// @ts-expect-error the site declares no Collection by that name
	void (() => loadCollection(site, 'places'));
});
