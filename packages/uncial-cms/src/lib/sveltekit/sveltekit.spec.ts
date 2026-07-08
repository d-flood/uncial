import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createBlockRegistry, createSchema } from 'uncial/core';
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

afterAll(() => rmSync(localContentDir, { recursive: true, force: true }));

const blocks = createBlockRegistry([]);
const schema = createSchema(blocks, { metaFields: { title: { default: '' } } });
const opts = { config, blocks, schema, localContentDir };

describe('default mapping', () => {
	it('maps site paths to sources and back for nested paths', () => {
		for (const [path, source] of [
			['about', 'content/about.json'],
			['blog/hello', 'content/blog/hello.json'],
			['', 'content/index.json']
		] as const) {
			expect(defaultMapPathToSource(path, 'content')).toBe(source);
			expect(defaultMapSourceToPath(source, 'content')).toBe(path);
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
});

describe('createEditorHandlers', () => {
	const handlers = createEditorHandlers(opts);

	it('entries() matches the content route entry set', () => {
		expect(handlers.entries()).toEqual(createContentHandlers(opts).entries());
	});

	it('load() bakes the mapped source path and never the document', async () => {
		const data = await handlers.load({ params: { path: 'about' } });
		expect(data).toEqual({
			sourcePath: 'packages/uncial-cms/content/about.json',
			path: 'about'
		});
	});
});

describe('createIndexHandlers', () => {
	it('load() exposes the baked site config', async () => {
		const handlers = createIndexHandlers({ config, blocks, schema });
		await expect(handlers.load()).resolves.toEqual({ config });
	});
});
