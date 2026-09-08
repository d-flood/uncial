import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createBlockRegistry, createSchema } from 'uncial/core';
import { defineSite } from '../define-site.js';
import type { UncialCmsSiteConfig } from '../types.js';
import {
	createContentHandlers,
	createEditorHandlers,
	createIndexHandlers,
	defaultMapPathToSource,
	defaultMapSourceToPath
} from './index.js';

const config: UncialCmsSiteConfig = {
	forge: 'github',
	repo: 'd-flood/uncial',
	branch: 'main',
	contentDir: 'packages/uncial-cms/content',
	authWorkerUrl: '',
	appSlug: 'uncial-cms'
};

const doc = (text: string) => ({
	type: 'doc',
	version: 1,
	meta: { title: text },
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
});

const localContentDir = mkdtempSync(join(tmpdir(), 'uncial-cms-content-'));
writeFileSync(join(localContentDir, 'index.json'), JSON.stringify(doc('Home')));
writeFileSync(join(localContentDir, 'about.json'), JSON.stringify(doc('About')));
mkdirSync(join(localContentDir, 'guide'), { recursive: true });
writeFileSync(join(localContentDir, 'guide/start.json'), JSON.stringify(doc('Start')));
writeFileSync(join(localContentDir, 'settings.json'), JSON.stringify(doc('Settings')));

afterAll(() => rmSync(localContentDir, { recursive: true, force: true }));

const blocks = createBlockRegistry([]);
const schema = createSchema(blocks, { metaFields: { title: { default: '' } } });
// `settings.json` stands in for the non-page files every real content dir holds.
const notAPage = (entry: { path: string }) => entry.path === 'settings';
const opts = { config, blocks, schema, localContentDir, exclude: notAPage };

describe('default mapping', () => {
	it('maps site paths to sources and back for default and non-default locales', () => {
		for (const [path, source, locale] of [
			['about', 'content/about.json', undefined],
			['about', 'content/about.json', 'en'],
			['blog/hello', 'content/blog/hello.json', 'en'],
			['', 'content/index.json', 'en'],
			['about', 'content/de/about.json', 'de'],
			['blog/hello', 'content/de/blog/hello.json', 'de'],
			['', 'content/de/index.json', 'de']
		] as const) {
			expect(defaultMapPathToSource(path, 'content', locale)).toBe(source);
			expect(defaultMapSourceToPath(source, 'content', locale)).toBe(path);
		}
	});

	it('normalizes leading and trailing slashes', () => {
		expect(defaultMapPathToSource('/blog/hello/', 'content')).toBe('content/blog/hello.json');
		expect(defaultMapPathToSource('/', 'content')).toBe('content/index.json');
	});

	it('rejects sources outside the content dir', () => {
		expect(() => defaultMapSourceToPath('other/about.json', 'content')).toThrow(/not a JSON file/);
	});
});

describe('createContentHandlers', () => {
	const handlers = createContentHandlers(opts);

	it('entries() lists one route per content JSON file, nested included', () => {
		expect(handlers.entries()).toEqual([
			{ path: 'about' },
			{ path: 'guide/start' },
			{ path: '' }
		]);
	});

	it('load() reads and normalizes the mapped document', async () => {
		const { document, meta } = await handlers.load({ params: { path: 'guide/start' } });
		expect(meta).toMatchObject({ title: 'Start' });
		expect(document.content?.[0]).toMatchObject({ type: 'paragraph' });
	});

	it('load() honors a custom mapPathToSource', async () => {
		const custom = createContentHandlers({
			...opts,
			mapPathToSource: () => `${config.contentDir}/about.json`
		});
		const { meta } = await custom.load({ params: { path: 'anything' } });
		expect(meta).toMatchObject({ title: 'About' });
	});

	it('load() rejects sources outside the content dir', async () => {
		const custom = createContentHandlers({
			...opts,
			mapPathToSource: () => 'somewhere/else.json'
		});
		await expect(custom.load({ params: { path: 'about' } })).rejects.toThrow(
			/outside the content dir/
		);
	});

	it('load() returns the page path so a site need not re-spread it', async () => {
		const { path } = await handlers.load({ params: { path: 'guide/start' } });
		expect(path).toBe('guide/start');
	});

	it('exclude() keeps a non-page file out of entries and refuses to load it', async () => {
		expect(createContentHandlers({ config, blocks, schema, localContentDir }).entries()).toContainEqual({
			path: 'settings'
		});
		expect(handlers.entries()).not.toContainEqual({ path: 'settings' });
		await expect(handlers.load({ params: { path: 'settings' } })).rejects.toThrow(
			/"settings" is excluded/
		);
	});

	it('load() normalizes with the schema the resolver picks for the page path', async () => {
		const essaySchema = createSchema(blocks, {
			metaFields: { title: { default: '' }, byline: { default: 'Anonymous' } }
		});
		const seen: string[] = [];
		const perPath = createContentHandlers({
			...opts,
			schema: (path) => {
				seen.push(path);
				return path.startsWith('guide/') ? essaySchema : schema;
			}
		});

		const essay = await perPath.load({ params: { path: 'guide/start' } });
		const landing = await perPath.load({ params: { path: 'about' } });

		expect(seen).toEqual(['guide/start', 'about']);
		expect(essay.meta).toMatchObject({ title: 'Start', byline: 'Anonymous' });
		expect(landing.meta).not.toHaveProperty('byline');
	});
});

describe('createEditorHandlers', () => {
	const handlers = createEditorHandlers(opts);

	afterEach(() => vi.unstubAllEnvs());

	it('entries() matches the content route entry set', () => {
		expect(handlers.entries()).toEqual(createContentHandlers(opts).entries());
	});

	it('omits editor variants from a production prerender when devOnly is set', () => {
		vi.stubEnv('DEV', false);

		const devOnlyHandlers = createEditorHandlers({ ...opts, devOnly: true });

		expect(devOnlyHandlers.entries()).toEqual([]);
	});

	it('keeps editor variants available on the development server when devOnly is set', () => {
		vi.stubEnv('DEV', true);

		const devOnlyHandlers = createEditorHandlers({ ...opts, devOnly: true });

		expect(devOnlyHandlers.entries()).toEqual(createContentHandlers(opts).entries());
	});

	it('load() bakes the mapped source path and never the document', async () => {
		const data = await handlers.load({ params: { path: 'about' } });
		expect(data).toEqual({
			sourcePath: 'packages/uncial-cms/content/about.json',
			pagePath: 'about'
		});
	});

	it('exclude() keeps a non-page file out of entries and refuses to load it', async () => {
		expect(handlers.entries()).not.toContainEqual({ path: 'settings' });
		await expect(handlers.load({ params: { path: 'settings' } })).rejects.toThrow(
			/"settings" is excluded/
		);
	});

	it('prerenders no editor variants for a local-only site in a production build', () => {
		vi.stubEnv('DEV', false);
		const site = defineSite({ contentDir: 'content', localContentDir }, { dev: false });

		const siteHandlers = createEditorHandlers({ site, blocks, schema, exclude: notAPage });

		expect(site.localOnly).toBe(true);
		expect(siteHandlers.entries()).toEqual([]);
	});

	it('takes the config and content dir from a site object', async () => {
		const site = defineSite(
			{ contentDir: 'content', localContentDir, github: { repo: 'd-flood/uncial', branch: 'main' } },
			{ dev: false }
		);

		const siteHandlers = createEditorHandlers({ site, blocks, schema, exclude: notAPage });

		expect(siteHandlers.entries()).toEqual([{ path: 'about' }, { path: 'guide/start' }, { path: '' }]);
		await expect(siteHandlers.load({ params: { path: 'about' } })).resolves.toEqual({
			sourcePath: 'content/about.json',
			pagePath: 'about'
		});
	});
});

describe('createIndexHandlers', () => {
	it('load() exposes the baked site config', async () => {
		const handlers = createIndexHandlers({ config, blocks, schema });
		await expect(handlers.load()).resolves.toEqual({ config });
	});

	it('load() takes that config from a site object', async () => {
		const site = defineSite({ contentDir: 'content' }, { dev: true });
		const handlers = createIndexHandlers({ site, blocks, schema });
		await expect(handlers.load()).resolves.toEqual({ config: site.config });
	});
});
