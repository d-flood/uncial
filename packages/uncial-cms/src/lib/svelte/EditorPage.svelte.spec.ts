import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import type { ContentDocument } from 'uncial';
import { defineServerSite, defineSite } from '../define-site.js';
import type { Action } from '../server-forge/protocol.js';
import EditorPage from './EditorPage.svelte';

const meta = { title: { default: 'Untitled page', required: true } };

const SOURCE_PATH = 'content/about.json';
const BODY_TEXT = 'Hello from the local checkout.';

const storedDocument = (): ContentDocument =>
	({
		type: 'doc',
		version: 1,
		meta: { title: 'A real title' },
		content: [{ type: 'paragraph', content: [{ type: 'text', text: BODY_TEXT }] }]
	}) as ContentDocument;

interface StubbedCall {
	url: string;
	method: string;
}

/** The local Vite middleware's file endpoint, as `local/adapter.ts` calls it. */
function stubLocalFetch(calls: StubbedCall[] = []) {
	return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input instanceof Request ? input.url : input);
		const method = (init?.method ?? 'GET').toUpperCase();
		calls.push({ url, method });
		if (url.includes('/__uncial-cms/local/files/') && method === 'POST') {
			return jsonResponse(200, {
				content: JSON.stringify(storedDocument()),
				sha: 'sha-1'
			});
		}
		throw new Error(`Unexpected request: ${method} ${url}`);
	});
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	vi.restoreAllMocks();
});

describe('EditorPage', () => {
	beforeEach(() => {
		globalThis.fetch = stubLocalFetch() as unknown as typeof fetch;
	});

	it('reports the source path in its status line', async () => {
		const site = defineSite({ contentDir: 'content' }, { blocks: [], meta }, { dev: true });
		render(EditorPage, {
			site,
			data: { sourcePath: SOURCE_PATH, pagePath: 'about' }
		});

		await expect.element(page.getByRole('status')).toHaveTextContent(SOURCE_PATH);
	});

	it('seeds the metadata panel from the loaded document rather than the schema default', async () => {
		const site = defineSite({ contentDir: 'content' }, { blocks: [], meta }, { dev: true });
		render(EditorPage, {
			site,
			data: { sourcePath: SOURCE_PATH, pagePath: 'about' }
		});

		await expect.element(page.getByText(BODY_TEXT)).toBeInTheDocument();
		await page.getByLabelText('Edit document metadata').click();
		await expect.element(page.getByLabelText('title')).toHaveValue('A real title');
	});

	it('offers a Save button that starts disabled when the site does not autosave', async () => {
		const site = defineSite({ contentDir: 'content' }, { blocks: [], meta }, { dev: true });
		const screen = render(EditorPage, {
			site,
			data: { sourcePath: SOURCE_PATH, pagePath: 'about' }
		});

		// Synchronously, before the dynamic editor import resolves and the
		// controller reports the document loaded.
		expect(screen.container.querySelector('button')?.disabled).toBe(true);
		await expect.element(page.getByRole('button', { name: 'Save' })).toBeEnabled();
	});

	it('renders no Save button when the site autosaves', async () => {
		const site = defineSite(
			{ contentDir: 'content', autosaveMs: 500 },
			{ blocks: [], meta },
			{ dev: true }
		);
		render(EditorPage, {
			site,
			data: { sourcePath: SOURCE_PATH, pagePath: 'about' }
		});

		await expect.element(page.getByText(BODY_TEXT)).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Save' })).not.toBeInTheDocument();
	});
});

describe('EditorPage on the server forge', () => {
	const site = defineServerSite({ apiBase: '/dashboard/api/content' }, { blocks: [] });

	function stubServer(allowed: Action[]) {
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(String(input instanceof Request ? input.url : input));
			const method = (init?.method ?? 'GET').toUpperCase();
			expect(init?.credentials).toBe('same-origin');
			if (url.pathname === '/dashboard/api/content' && method === 'GET') {
				if (url.searchParams.has('session')) {
					return jsonResponse(200, { user: { id: 'u1', email: 'ada@example.org', name: 'Ada' } });
				}
				return jsonResponse(200, {
					path: 'about',
					kind: 'page',
					draft: storedDocument(),
					published: storedDocument(),
					etag: 'etag-1',
					publishedAt: '2026-01-01T00:00:00.000Z',
					updatedAt: '2026-01-02T00:00:00.000Z',
					updatedBy: 'ada@example.org',
					allowed
				});
			}
			throw new Error(`Unexpected request: ${method} ${url}`);
		}) as unknown as typeof fetch;
	}

	const renderPage = () =>
		render(EditorPage, { site, data: { sourcePath: 'about', pagePath: 'about' } });

	it('shows the Draft/Published status and the controls authorize allows', async () => {
		stubServer(['read-draft', 'save-draft', 'publish', 'unpublish', 'delete']);
		renderPage();

		await expect.element(page.getByText('Published with Draft changes')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Publish', exact: true })).toBeEnabled();
		await expect.element(page.getByRole('button', { name: 'Unpublish' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Delete' })).toBeVisible();
	});

	it('hides Publish when allowed lacks publish', async () => {
		stubServer(['read-draft', 'save-draft']);
		renderPage();

		await expect.element(page.getByText(BODY_TEXT)).toBeInTheDocument();
		await expect.element(page.getByText('Published with Draft changes')).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Publish', exact: true }))
			.not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
	});
});
