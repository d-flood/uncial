import type { Page, Route } from '@playwright/test';

export const DOCS_REPO = 'd-flood/uncial';

/** Repo-root-relative source for the one seeded Docs page. */
export const GETTING_STARTED_SOURCE =
	'packages/uncial-docs/content/docs/getting-started.json';

/** A distinctive phrase from the getting-started document, for assertions. */
export const GETTING_STARTED_TEXT = 'Your presentation layer is the editor';

export const GETTING_STARTED_DOC = {
	type: 'doc',
	version: 1,
	meta: { title: 'Getting started' },
	content: [
		{
			type: 'heading',
			attrs: { level: 2 },
			content: [{ type: 'text', text: GETTING_STARTED_TEXT }]
		},
		{
			type: 'paragraph',
			content: [{ type: 'text', text: 'Uncial removes the fork.' }]
		}
	]
};

/**
 * Seed a cached forge session in sessionStorage before the app loads, so the
 * GitHub adapter's `authenticate` returns it without invoking the popup provider
 * (the shipped default). Mirrors uncial-cms's `seedDemoSession`.
 */
export async function seedDocsSession(page: Page): Promise<void> {
	await page.addInitScript((repo) => {
		sessionStorage.setItem(
			`uncial-cms:session:${repo}`,
			JSON.stringify({
				token: 'ghs_e2e_installation_token',
				expiresAt: null,
				repo,
				user: {
					login: 'octocat',
					name: 'Octo Cat',
					email: '583231+octocat@users.noreply.github.com'
				}
			})
		);
	}, DOCS_REPO);
}

export function toBase64(text: string): string {
	return Buffer.from(text, 'utf-8').toString('base64');
}

export function fromBase64(base64: string): string {
	return Buffer.from(base64, 'base64').toString('utf-8');
}

export interface RecordedPut {
	path: string;
	body: Record<string, unknown>;
}

export interface RecordedDelete {
	path: string;
	body: Record<string, unknown>;
}

/** Repo-root-relative content dir the docs index lists and commits into. */
export const DOCS_CONTENT_DIR = 'packages/uncial-docs/content/docs';

export interface InterceptDocsOptions {
	/** When true, PUT saves are rejected with 409 to drive the conflict flow. */
	conflictOnPut?: boolean;
}

/**
 * Intercepts api.github.com for the docs site: GET serves the getting-started
 * doc, PUT records the committed body (and returns a fresh sha), so tests can
 * assert what a save persists. Mirrors uncial-cms's `interceptDemoGitHub`.
 */
export async function interceptDocsGitHub(
	page: Page,
	opts: InterceptDocsOptions = {}
): Promise<{ puts: RecordedPut[] }> {
	const puts: RecordedPut[] = [];

	await page.route('https://api.github.com/**', async (route: Route) => {
		const request = route.request();
		const url = new URL(request.url());

		if (url.pathname === '/user') {
			await route.fulfill({ json: { login: 'octocat', id: 583231, name: 'Octo Cat' } });
			return;
		}

		if (url.pathname === `/repos/d-flood/uncial/contents/${GETTING_STARTED_SOURCE}`) {
			if (request.method() === 'GET') {
				const raw = JSON.stringify(GETTING_STARTED_DOC);
				await route.fulfill({
					json: { content: toBase64(raw), encoding: 'base64', sha: 'sha-original', size: raw.length }
				});
				return;
			}
			if (request.method() === 'PUT') {
				if (opts.conflictOnPut) {
					await route.fulfill({ status: 409, json: { message: 'sha mismatch' } });
					return;
				}
				puts.push({
					path: url.pathname.replace('/repos/d-flood/uncial/contents/', ''),
					body: request.postDataJSON() as Record<string, unknown>
				});
				await route.fulfill({
					json: { content: { sha: 'sha-updated' }, commit: { sha: '1234567deadbeef' } }
				});
				return;
			}
		}

		await route.fulfill({ status: 404, json: { message: 'Not Found' } });
	});

	return { puts };
}

/**
 * Store-backed api.github.com mock for the docs index flows: GET serves files
 * and directory listings from an in-memory map, PUT upserts (recording the
 * body), DELETE removes. Mirrors uncial-cms's `interceptDemoGitHubWithStore`,
 * so create → set-meta → list → delete round-trips against the docs content dir.
 */
export async function interceptDocsGitHubWithStore(
	page: Page,
	initialFiles: Record<string, string>
): Promise<{ puts: RecordedPut[]; deletes: RecordedDelete[] }> {
	const files = new Map(Object.entries(initialFiles));
	const shas = new Map<string, string>();
	let shaCounter = 0;
	const shaOf = (path: string) => shas.get(path) ?? 'sha-original';
	const puts: RecordedPut[] = [];
	const deletes: RecordedDelete[] = [];

	await page.route('https://api.github.com/**', async (route: Route) => {
		const request = route.request();
		const url = new URL(request.url());

		if (url.pathname === '/user') {
			await route.fulfill({ json: { login: 'octocat', id: 583231, name: 'Octo Cat' } });
			return;
		}

		const prefix = '/repos/d-flood/uncial/contents/';
		if (!url.pathname.startsWith(prefix)) {
			await route.fulfill({ status: 404, json: { message: 'Not Found' } });
			return;
		}
		const path = decodeURIComponent(url.pathname.slice(prefix.length));

		if (request.method() === 'GET') {
			const content = files.get(path);
			if (content !== undefined) {
				await route.fulfill({
					json: {
						content: toBase64(content),
						encoding: 'base64',
						sha: shaOf(path),
						size: content.length
					}
				});
				return;
			}
			// Directory listing: immediate children of `path`.
			const children = new Map<string, 'file' | 'dir'>();
			for (const key of files.keys()) {
				if (!key.startsWith(`${path}/`)) continue;
				const rest = key.slice(path.length + 1);
				const [first] = rest.split('/');
				children.set(`${path}/${first}`, rest.includes('/') ? 'dir' : 'file');
			}
			if (children.size > 0) {
				await route.fulfill({
					json: Array.from(children, ([childPath, type]) => ({ path: childPath, type }))
				});
				return;
			}
			await route.fulfill({ status: 404, json: { message: 'Not Found' } });
			return;
		}

		if (request.method() === 'PUT') {
			const body = request.postDataJSON() as Record<string, unknown>;
			puts.push({ path, body });
			files.set(path, fromBase64(String(body.content)));
			shas.set(path, `sha-${++shaCounter}`);
			await route.fulfill({
				json: { content: { sha: shaOf(path) }, commit: { sha: `${shaCounter}234567deadbeef` } }
			});
			return;
		}

		if (request.method() === 'DELETE') {
			const body = request.postDataJSON() as Record<string, unknown>;
			deletes.push({ path, body });
			files.delete(path);
			shas.delete(path);
			await route.fulfill({ json: { content: null, commit: { sha: 'del4567deadbeef' } } });
			return;
		}

		await route.fulfill({ status: 404, json: { message: 'Not Found' } });
	});

	return { puts, deletes };
}
