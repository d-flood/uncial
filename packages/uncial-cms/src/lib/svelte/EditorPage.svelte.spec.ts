import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { createBlockRegistry, createSchema } from 'uncial/core';
import type { ContentDocument } from 'uncial/core';
import { encodeBase64 } from '../base64.js';
import { defineSite } from '../define-site.js';
import type { ForgeSession, SessionProvider } from '../types.js';
import EditorPage from './EditorPage.svelte';

const blocks = createBlockRegistry([]);
const schema = createSchema(blocks, {
	metaFields: { title: { default: 'Untitled page', required: true } }
});

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

	it('renders the loaded document in the light DOM, in the host cascade', async () => {
		const site = defineSite({ contentDir: 'content' }, { dev: true });
		render(EditorPage, {
			site,
			sourcePath: SOURCE_PATH,
			pagePath: 'about',
			blocks,
			schema
		});

		const body = page.getByText(BODY_TEXT);
		await expect.element(body).toBeInTheDocument();
		// Every ancestor of the rendered document is in the main document tree:
		// a shadow root anywhere above it would make `getRootNode()` that root.
		expect(body.element().getRootNode()).toBe(document);
	});

	it('reports the source path in its status line', async () => {
		const site = defineSite({ contentDir: 'content' }, { dev: true });
		render(EditorPage, {
			site,
			sourcePath: SOURCE_PATH,
			pagePath: 'about',
			blocks,
			schema
		});

		await expect.element(page.getByRole('status')).toHaveTextContent(SOURCE_PATH);
	});

	it('seeds the metadata panel from the loaded document rather than the schema default', async () => {
		const site = defineSite({ contentDir: 'content' }, { dev: true });
		render(EditorPage, {
			site,
			sourcePath: SOURCE_PATH,
			pagePath: 'about',
			blocks,
			schema
		});

		await expect.element(page.getByText(BODY_TEXT)).toBeInTheDocument();
		await page.getByLabelText('Edit document metadata').click();
		await expect.element(page.getByLabelText('title')).toHaveValue('A real title');
	});

	it('offers a Save button that starts disabled when the site does not autosave', async () => {
		const site = defineSite({ contentDir: 'content' }, { dev: true });
		const screen = render(EditorPage, {
			site,
			sourcePath: SOURCE_PATH,
			pagePath: 'about',
			blocks,
			schema
		});

		// Synchronously, before the dynamic editor import resolves and the
		// controller reports the document loaded.
		expect(screen.container.querySelector('button')?.disabled).toBe(true);
		await expect.element(page.getByRole('button', { name: 'Save' })).toBeEnabled();
	});

	it('renders no Save button when the site autosaves', async () => {
		const site = defineSite({ contentDir: 'content', autosaveMs: 500 }, { dev: true });
		render(EditorPage, {
			site,
			sourcePath: SOURCE_PATH,
			pagePath: 'about',
			blocks,
			schema
		});

		await expect.element(page.getByText(BODY_TEXT)).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Save' })).not.toBeInTheDocument();
	});
});

describe('EditorPage conflict banner', () => {
	// The conflict path needs a forge that can refuse a stale write. The local
	// backend never does — it is last-writer-wins over one checkout — so this
	// drives the GitHub forge, whose adapter maps 409 to ConflictError.
	const site = defineSite(
		{ contentDir: 'content', github: { repo: 'owner/repo', branch: 'main' } },
		{ dev: false }
	);

	const session: ForgeSession = {
		token: 'test-token',
		expiresAt: null,
		repo: 'owner/repo',
		user: { login: 'tester', name: 'Tester', email: 'tester@example.com' }
	};
	const sessionProvider: SessionProvider = async () => session;

	beforeEach(() => {
		sessionStorage.clear();
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input instanceof Request ? input.url : input);
			const method = (init?.method ?? 'GET').toUpperCase();
			if (url.includes('/contents/') && method === 'GET') {
				return jsonResponse(200, {
					content: encodeBase64(JSON.stringify(storedDocument())),
					encoding: 'base64',
					sha: 'sha-1',
					size: 200
				});
			}
			if (url.includes('/contents/') && method === 'PUT') {
				return jsonResponse(409, { message: 'is at 0000 but expected 1111' });
			}
			throw new Error(`Unexpected request: ${method} ${url}`);
		}) as unknown as typeof fetch;
	});

	it('blocks with download, reload and dismiss when a save conflicts, and Dismiss hides it', async () => {
		render(EditorPage, {
			site,
			sourcePath: SOURCE_PATH,
			pagePath: 'about',
			blocks,
			schema,
			sessionProvider
		});

		const save = page.getByRole('button', { name: 'Save' });
		await expect.element(save).toBeEnabled();
		await save.click();

		const banner = page.getByRole('alert');
		await expect.element(banner).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Download my version' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Reload latest' })).toBeVisible();

		await page.getByRole('button', { name: 'Dismiss' }).click();
		await expect.element(banner).not.toBeInTheDocument();
	});
});
