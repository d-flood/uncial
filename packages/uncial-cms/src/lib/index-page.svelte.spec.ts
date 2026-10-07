import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createBlockRegistry, createSchema } from 'uncial/core';
import { mountIndexPage } from './index-page.js';
import { LOCAL_API_PATH } from './local/constants.js';

const blocks = createBlockRegistry([]);
const schema = createSchema(blocks);
const DOC = JSON.stringify({ type: 'doc', version: 1, meta: {}, content: [] });

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	history.replaceState(null, '', location.pathname + location.search);
	vi.restoreAllMocks();
});

function serveLocalForge(files: Record<string, string>): void {
	globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		if (!url.pathname.startsWith(`${LOCAL_API_PATH}/`)) return originalFetch(input, init);
		const [kind, ...segments] = url.pathname.slice(LOCAL_API_PATH.length + 1).split('/');
		const path = segments.map(decodeURIComponent).join('/');
		const json = (body: unknown, status = 200) =>
			new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

		if (kind === 'dirs') {
			const entries = new Map<string, 'file' | 'dir'>();
			for (const key of Object.keys(files)) {
				if (!key.startsWith(`${path}/`)) continue;
				const [first, ...deeper] = key.slice(path.length + 1).split('/');
				entries.set(`${path}/${first}`, deeper.length > 0 ? 'dir' : 'file');
			}
			return json({ entries: Array.from(entries, ([entry, type]) => ({ path: entry, type })) });
		}
		if (init?.method === 'PUT') {
			files[path] = (JSON.parse(String(init.body)) as { content: string }).content;
			return json({ sha: `sha-${path}`, commitSha: 'commit' });
		}
		if (init?.method === 'DELETE') {
			delete files[path];
			return json({});
		}
		return path in files
			? json({ content: files[path], sha: `sha-${path}` })
			: json({ error: 'File not found.' }, 404);
	}) as typeof fetch;
}

it('the deprecated mountIndexPage still lists, creates and deletes pages', async () => {
	const files: Record<string, string> = { 'content/index.json': DOC, 'content/about.json': DOC };
	serveLocalForge(files);
	const target = document.createElement('div');
	document.body.append(target);

	const handle = mountIndexPage(target, {
		config: { forge: 'local', contentDir: 'content' },
		blocks,
		schema,
		editorHref: (path) => `/${path}/edit/`
	});

	const rows = page.getByRole('listitem');
	await expect.element(rows.filter({ hasText: '/about/' })).toBeVisible();
	await expect.element(rows.filter({ hasText: '(site root)' })).toBeVisible();

	await page.getByLabelText('New page path').fill('team/new-page');
	await page.getByRole('button', { name: 'Create page' }).click();
	await expect.poll(() => files['content/team/new-page.json']).toBeDefined();
	await expect.poll(() => location.hash).toBe('#/edit/team/new-page');

	location.hash = '#/pages';
	const created = rows.filter({ hasText: '/team/new-page/' });
	await created.getByRole('button', { name: 'Delete' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
	await expect.poll(() => 'content/team/new-page.json' in files).toBe(false);
	await expect.element(created).not.toBeInTheDocument();

	handle.destroy();
	expect(target.childElementCount).toBe(0);
	target.remove();
});
