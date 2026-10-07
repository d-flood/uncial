import { afterEach, expect, it, onTestFinished, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { createBlockRegistry, createSchema } from 'uncial/core';
import type { UncialEditorElement } from 'uncial/web-components';
import { LOCAL_API_PATH } from '../local/constants.js';
import type { ContentSummary, MediaListView } from '../server-forge/protocol.js';
import type { ForgeSession, LocalSiteConfig, ServerSiteConfig } from '../types.js';
import Dashboard from './Dashboard.svelte';
import './element.js';

const blocks = createBlockRegistry([]);
const schema = createSchema(blocks);
const config: ServerSiteConfig = { forge: 'server', apiBase: '/api/content' };
const session: ForgeSession = {
	token: '',
	expiresAt: null,
	repo: config.apiBase,
	user: { login: 'ada@example.org', name: 'Ada Lovelace', email: 'ada@example.org' }
};
const ABOUT: ContentSummary = {
	path: '/about/',
	kind: 'page',
	status: 'published',
	publishedAt: null,
	updatedAt: '2026-10-05T00:00:00Z',
	updatedBy: 'ada@example.org'
};

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	history.replaceState(null, '', location.pathname + location.search);
});

function serveList(response: () => Response): void {
	globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
		new URL(String(input)).pathname === config.apiBase ? response() : originalFetch(input, init)
	) as typeof fetch;
}

const records = () => Response.json({ records: [ABOUT] });

it('hides the create and delete controls that can() refuses', async () => {
	serveList(records);
	const can = vi.fn((action: string) => action !== 'create' && action !== 'delete');
	render(Dashboard, { config, blocks, schema, can, sessionProvider: async () => session });

	const row = page.getByRole('listitem').filter({ hasText: '/about/' });
	await expect.element(row.getByRole('link', { name: 'Edit /about/' })).toBeInTheDocument();
	await expect.element(row.getByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
	await expect.element(page.getByLabelText('New page path')).not.toBeInTheDocument();
	expect(can).toHaveBeenCalledWith('create');
	expect(can).toHaveBeenCalledWith('delete', 'about');
});

it('allows every control without can()', async () => {
	serveList(records);
	render(Dashboard, { config, blocks, schema, sessionProvider: async () => session });

	const row = page.getByRole('listitem').filter({ hasText: '/about/' });
	await expect.element(row.getByRole('button', { name: 'Delete /about/' })).toBeInTheDocument();
	await expect.element(page.getByLabelText('New page path')).toBeInTheDocument();
});

it('shows the signed-out screen when the provider rejects, and Sign in re-runs it', async () => {
	serveList(records);
	const sessionProvider = vi
		.fn<() => Promise<ForgeSession>>()
		.mockRejectedValueOnce(new Error('Your sign-in has expired.'))
		.mockResolvedValue(session);
	render(Dashboard, { config, blocks, schema, sessionProvider, signOutHref: '/logout' });

	await expect.element(page.getByRole('heading', { name: 'Signed out' })).toBeInTheDocument();
	await expect.element(page.getByText('Your sign-in has expired.')).toBeInTheDocument();
	await expect.element(page.getByRole('navigation')).not.toBeInTheDocument();
	await expect.element(page.getByRole('link', { name: 'Sign out' })).not.toBeInTheDocument();

	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect.element(page.getByRole('heading', { name: 'Pages' })).toHaveFocus();
	await expect.element(page.getByRole('status')).toHaveTextContent('Signed in as Ada Lovelace');
	await expect
		.element(page.getByRole('link', { name: 'Sign out' }))
		.toHaveAttribute('href', '/logout');
	await expect
		.element(page.getByRole('listitem').filter({ hasText: '/about/' }))
		.toBeInTheDocument();
	expect(sessionProvider).toHaveBeenCalledTimes(2);
});

it('shows the signed-out screen when a forge call returns 401', async () => {
	serveList(() => Response.json({ error: 'Unauthorized' }, { status: 401 }));
	render(Dashboard, { config, blocks, schema, sessionProvider: async () => session });

	await expect.element(page.getByRole('heading', { name: 'Signed out' })).toHaveFocus();
	await expect.element(page.getByText('You are signed out.', { exact: false })).toBeInTheDocument();
	await expect.element(page.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
});

it.each(['media', 'edit/about'])('returns to sign-in when %s returns 401', async (section) => {
	history.replaceState(null, '', `#/${section}`);
	const media = { ...config, mediaApiBase: '/api/media' };
	globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
		[config.apiBase, media.mediaApiBase].includes(new URL(String(input)).pathname)
			? Response.json({ error: 'Unauthorized' }, { status: 401 })
			: originalFetch(input, init)
	) as typeof fetch;
	render(Dashboard, { config: media, blocks, schema, sessionProvider: async () => session });

	await expect.element(page.getByRole('heading', { name: 'Signed out' })).toHaveFocus();
	await expect.element(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
	await expect.element(page.getByRole('navigation')).not.toBeInTheDocument();
});

it('hides fallback editing when can() refuses save-draft, including direct hash links', async () => {
	history.replaceState(null, '', '#/edit/about');
	serveList(records);
	const can = vi.fn((action: string) => action !== 'save-draft');
	render(Dashboard, { config, blocks, schema, can, sessionProvider: async () => session });

	await expect
		.element(page.getByText('You don’t have permission to edit this page.'))
		.toBeVisible();
	await expect.element(page.getByRole('button', { name: 'Save' })).not.toBeInTheDocument();
	await expect.element(page.getByRole('textbox')).not.toBeInTheDocument();
	expect(can).toHaveBeenCalledWith('save-draft', 'about');
});

it('returns to sign-in when a fallback save meets an expired session', async () => {
	history.replaceState(null, '', '#/edit/about');
	globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		if (new URL(String(input)).pathname !== config.apiBase) return originalFetch(input, init);
		if (init?.method === 'PUT') return Response.json({ error: 'Unauthorized' }, { status: 401 });
		return Response.json({
			...ABOUT,
			draft: null,
			published: { type: 'doc', content: [], meta: {} },
			etag: 'about',
			allowed: ['save-draft']
		});
	}) as typeof fetch;
	render(Dashboard, { config, blocks, schema, sessionProvider: async () => session });

	const save = page.getByRole('button', { name: 'Save' });
	await expect.element(save).toBeEnabled();
	await save.click();
	await expect.element(page.getByRole('heading', { name: 'Signed out' })).toHaveFocus();
	await expect.element(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

it('searches git pages by their stored title even when the path does not match', async () => {
	const local: LocalSiteConfig = { forge: 'local', contentDir: 'content' };
	globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const path = new URL(String(input)).pathname;
		if (path === `${LOCAL_API_PATH}/dirs/content`) {
			return Response.json({ entries: [{ path: 'content/about.json', type: 'file' }] });
		}
		if (path === `${LOCAL_API_PATH}/files/content/about.json`) {
			return Response.json({
				content: JSON.stringify({ type: 'doc', content: [], meta: { title: 'Our research team' } }),
				sha: 'about'
			});
		}
		return originalFetch(input, init);
	}) as typeof fetch;
	render(Dashboard, { config: local, blocks, schema });

	await expect.element(page.getByText('Our research team')).toBeVisible();
	await page.getByLabelText('Search').fill('RESEARCH');
	await expect.element(page.getByText(/^Showing/)).toHaveTextContent('Showing 1–1 of 1 page');
	await expect.element(page.getByRole('link', { name: 'Edit /about/' })).toBeVisible();
});

it('uses the Dashboard media directory and base in the fallback picker, respecting upload permission', async () => {
	history.replaceState(null, '', '#/edit/about');
	const local: LocalSiteConfig = {
		forge: 'local',
		contentDir: 'content',
		mediaDir: 'public/assets'
	};
	globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const path = new URL(String(input)).pathname;
		if (path === `${LOCAL_API_PATH}/dirs/public/assets`) {
			return Response.json({ entries: [{ path: 'public/assets/folio.png', type: 'file' }] });
		}
		if (path === `${LOCAL_API_PATH}/files/content/about.json`) {
			return Response.json({
				content: JSON.stringify({ type: 'doc', content: [], meta: {} }),
				sha: 'about'
			});
		}
		return originalFetch(input, init);
	}) as typeof fetch;
	render(Dashboard, {
		config: local,
		blocks,
		schema,
		staticDir: 'public',
		basePath: '/brand',
		can: (action) => action !== 'media-upload'
	});

	await expect
		.poll(() => document.querySelector<UncialEditorElement>('uncial-editor')?.imageSource)
		.toBeDefined();
	const source = document.querySelector<UncialEditorElement>('uncial-editor')!.imageSource!;
	expect(source.upload).toBeUndefined();
	expect(await source.browse!()).toEqual(['/assets/folio.png']);
	expect(source.thumbnail!('/assets/folio.png')).toBe('/brand/assets/folio.png');
});

const RECORDS: ContentSummary[] = Array.from({ length: 120 }, (_, n) => ({
	...ABOUT,
	path: `/${n < 60 ? 'posts' : 'docs'}/p${String(n).padStart(3, '0')}/`,
	title: `Entry ${n}`,
	kind: n < 60 ? 'post' : 'doc',
	status: (['draft', 'published', 'changed'] as const)[n % 3]!
}));

it('searches, filters and pages 120 server records, keeping the query in the hash', async () => {
	serveList(() => Response.json({ records: RECORDS }));
	render(Dashboard, { config, blocks, schema, sessionProvider: async () => session });

	const summary = page.getByText(/^Showing/);
	await expect.element(summary).toHaveTextContent('Showing 1–50 of 120 pages');
	await page.getByRole('button', { name: 'Next page' }).click();
	await expect.element(summary).toHaveTextContent('Showing 51–100 of 120 pages');
	const row = (path: string) => page.getByRole('listitem').filter({ hasText: path });
	await expect.element(row('/posts/p050/')).toBeInTheDocument();
	await expect.element(row('/posts/p049/')).not.toBeInTheDocument();
	expect(location.hash).toBe('#/pages?page=2');

	await page.getByLabelText('Type').selectOptions('post');
	await page.getByLabelText('Status').selectOptions('draft');
	await expect.element(summary).toHaveTextContent('Showing 1–40 of 40 pages');
	expect(location.hash).toBe('#/pages?kind=post&status=draft');

	const search = page.getByLabelText('Search');
	await search.fill('ENTRY 5');
	await expect.element(summary).toHaveTextContent('Showing 1–8 of 8 pages');
	await expect.element(search).toHaveFocus();
	await expect
		.element(page.getByRole('navigation', { name: 'Pagination' }))
		.not.toBeInTheDocument();
	expect(location.hash).toBe('#/pages?q=ENTRY+5&kind=post&status=draft');
});

it('restores the Pages query from the hash', async () => {
	history.replaceState(null, '', '#/pages?status=published&page=2');
	serveList(() => Response.json({ records: RECORDS }));
	render(Dashboard, { config, blocks, schema, sessionProvider: async () => session });

	await expect.element(page.getByText(/^Showing/)).toHaveTextContent('Showing 51–80 of 80 pages');
	await expect.element(page.getByLabelText('Status')).toHaveValue('published');
	await expect
		.element(page.getByRole('button', { name: 'Next page' }))
		.toHaveAttribute('aria-disabled', 'true');
});

it('keeps the Pages query and page when returning from another section', async () => {
	const { innerWidth, innerHeight } = window;
	await page.viewport(1280, 900);
	onTestFinished(() => page.viewport(innerWidth, innerHeight));
	history.replaceState(null, '', '#/pages?status=published&page=2');
	serveList(() => Response.json({ records: RECORDS }));
	render(Dashboard, { config, blocks, schema, sessionProvider: async () => session });
	await expect.element(page.getByText(/^Showing/)).toHaveTextContent('Showing 51–80 of 80 pages');

	const nav = page.getByRole('navigation', { name: 'Dashboard' });
	await nav.getByRole('link', { name: 'Globals' }).click();
	await expect.element(page.getByRole('heading', { name: 'Globals' })).toBeVisible();
	await nav.getByRole('link', { name: 'Pages' }).click();
	await expect.element(page.getByText(/^Showing/)).toHaveTextContent('Showing 51–80 of 80 pages');
	await expect.element(page.getByLabelText('Status')).toHaveValue('published');
	expect(location.hash).toBe('#/pages?status=published&page=2');
});

const FOLIO: MediaListView['items'][number] = {
	id: 'folio',
	key: `${'a'.repeat(64)}.png`,
	url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
	filename: 'folio.png',
	title: 'Folio 12 recto',
	contentType: 'image/png',
	width: 640,
	height: 480,
	size: 2048,
	uploadedBy: 'ada@example.org',
	uploadedAt: '2026-10-05T00:00:00Z',
	usage: 1,
	usagePaths: ['/about/']
};

it('shows server media with title, size, dimensions and usage, and alerts a refused delete', async () => {
	history.replaceState(null, '', '#/media');
	const media: ServerSiteConfig = { ...config, mediaApiBase: '/api/media' };
	globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		if (new URL(String(input)).pathname !== media.mediaApiBase) return originalFetch(input, init);
		if (init?.method === 'DELETE') {
			return Response.json(
				{ error: 'in use', usage: { count: 1, paths: ['/about/'] } },
				{ status: 409 }
			);
		}
		return Response.json({ items: [FOLIO], allowed: [] });
	}) as typeof fetch;
	render(Dashboard, { config: media, blocks, schema, sessionProvider: async () => session });

	await expect.element(page.getByText('Folio 12 recto')).toBeInTheDocument();
	await expect.element(page.getByText('folio.png · 640×480 · 2 KB')).toBeInTheDocument();
	await expect.element(page.getByText('In use by 1 Content document: /about/')).toBeInTheDocument();
	await expect.element(page.getByRole('searchbox', { name: 'Search media' })).toBeInTheDocument();

	await page.getByRole('button', { name: 'Delete Folio 12 recto' }).click();
	const dialog = page.getByRole('dialog', { name: 'This file is in use' });
	await expect.element(dialog).toHaveTextContent('/about/');
	await expect.element(dialog).toHaveTextContent('Remove these uses before deleting this file.');
	await dialog.getByRole('button', { name: 'Delete' }).click();
	await expect
		.element(page.getByRole('alert'))
		.toHaveTextContent('This Media item is used by 1 Content document: /about/.');
});

it('shows no metadata, usage or search UI for git-forge media', async () => {
	history.replaceState(null, '', '#/media');
	const local: LocalSiteConfig = {
		forge: 'local',
		contentDir: 'content',
		mediaDir: 'static/uploads'
	};
	const dirs = `${LOCAL_API_PATH}/dirs/static/uploads`;
	globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
		new URL(String(input)).pathname === dirs
			? Response.json({ entries: [{ path: 'static/uploads/folio.png', type: 'file' }] })
			: originalFetch(input, init)
	) as typeof fetch;
	render(Dashboard, { config: local, blocks, schema, basePath: '/docs' });

	const item = page.getByRole('listitem').filter({ hasText: 'folio.png' });
	await expect.element(item).toBeInTheDocument();
	await expect
		.element(item.getByRole('link', { name: 'Open folio.png' }))
		.toHaveAttribute('href', '/docs/uploads/folio.png');
	await expect.element(item.getByRole('button', { name: 'Delete folio.png' })).toBeEnabled();
	await expect.element(page.getByText(/in use/i)).not.toBeInTheDocument();
	await expect.element(page.getByRole('searchbox')).not.toBeInTheDocument();
	await expect.element(page.getByRole('button', { name: 'Upload' })).toBeEnabled();
});

it('shows a slotted App section only while its hash is active, styled by host CSS', async () => {
	serveList(records);
	const style = document.createElement('style');
	style.textContent = '.host-redirects { color: rgb(12, 34, 56); }';
	const element = document.createElement('uncial-dashboard');
	Object.assign(element, {
		config,
		blocks,
		schema,
		sessionProvider: async () => session,
		appSections: [
			{ id: 'redirects/rules', label: 'Redirects' },
			{ id: 'store', label: 'Store', href: '/admin/store/' }
		]
	});
	element.innerHTML = '<div slot="redirects/rules" class="host-redirects">Redirect rules</div>';
	document.head.append(style);
	document.body.append(element);
	const { innerWidth, innerHeight } = window;
	await page.viewport(1280, 900);
	onTestFinished(async () => {
		element.remove();
		style.remove();
		await page.viewport(innerWidth, innerHeight);
	});

	const nav = page.getByRole('navigation', { name: 'Dashboard' });
	const slotted = page.getByText('Redirect rules');
	await expect
		.element(nav.getByRole('link', { name: 'Store' }))
		.toHaveAttribute('href', '/admin/store/');
	await expect.element(page.getByRole('listitem').filter({ hasText: '/about/' })).toBeVisible();
	await expect.element(slotted).not.toBeVisible();

	const redirects = nav.getByRole('link', { name: 'Redirects' });
	await expect.element(redirects).toHaveAttribute('href', '#/app/redirects%2Frules');
	await redirects.click();
	await expect.element(page.getByRole('heading', { name: 'Redirects' })).toBeVisible();
	await expect.element(redirects).toHaveAttribute('aria-current', 'page');
	await expect
		.element(nav.getByRole('link', { name: 'Pages' }))
		.not.toHaveAttribute('aria-current');
	await expect.element(slotted).toBeVisible();
	await expect.element(slotted).toHaveStyle({ color: 'rgb(12, 34, 56)' });

	await nav.getByRole('link', { name: 'Pages' }).click();
	await expect.element(page.getByRole('heading', { name: 'Pages' })).toBeVisible();
	await expect.element(slotted).not.toBeVisible();
});

it('falls back to #/pages for an unknown or linked App section id', async () => {
	const appSections = [{ id: 'store', label: 'Store', href: '/admin/store/' }];
	for (const hash of ['#/app/nope', '#/app/store']) {
		history.replaceState(null, '', hash);
		serveList(records);
		const { unmount } = render(Dashboard, {
			config,
			blocks,
			schema,
			appSections,
			sessionProvider: async () => session
		});
		await expect.element(page.getByRole('heading', { name: 'Pages' })).toBeInTheDocument();
		expect(location.hash).toBe('#/pages');
		unmount();
	}
});

it('shows a Global read-only, with its schema defaults, when can() refuses global-edit', async () => {
	history.replaceState(null, '', '#/globals/footer');
	const local: LocalSiteConfig = { forge: 'local', contentDir: 'content' };
	const footer = createSchema(blocks, {
		metaFields: {
			note: { default: 'Made in Dallas' },
			columns: {
				default: [{ heading: 'Visit', links: [{ label: 'Map', href: '/map' }] }],
				list: {
					itemLabel: 'column',
					fields: {
						heading: '',
						links: { default: [], list: { itemLabel: 'link', fields: { label: '', href: '' } } }
					}
				}
			}
		}
	});
	const source = `${LOCAL_API_PATH}/files/content/_globals/footer.json`;
	globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
		new URL(String(input)).pathname === source
			? Response.json({ error: 'File not found.' }, { status: 404 })
			: originalFetch(input, init)
	) as typeof fetch;
	const can = vi.fn((action: string) => action !== 'global-edit');
	render(Dashboard, { config: local, blocks, schema, globals: { footer }, can });

	await expect.element(page.getByRole('heading', { name: 'footer' })).toBeInTheDocument();
	await expect
		.element(page.getByText('You don’t have permission to edit footer, so it is read-only.'))
		.toBeInTheDocument();
	await expect.element(page.getByLabelText('note')).toHaveValue('Made in Dallas');
	await expect.element(page.getByLabelText('note')).toBeDisabled();
	await expect.element(page.getByPlaceholder('href')).toHaveValue('/map');
	await expect.element(page.getByPlaceholder('href')).toBeDisabled();
	await expect.element(page.getByRole('button', { name: 'Add link' })).toBeDisabled();
	await expect.element(page.getByRole('button', { name: 'Save' })).not.toBeInTheDocument();
	expect(can).toHaveBeenCalledWith('global-edit', 'footer');
});
