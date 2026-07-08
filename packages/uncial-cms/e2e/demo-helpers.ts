import type { Page, Route } from '@playwright/test';

export const DEMO_REPO = 'd-flood/uncial';

/**
 * Seed a cached forge session in sessionStorage before the app loads, so the
 * GitHub adapter's `authenticate` returns it without ever invoking the popup
 * provider (the shipped default). This is the e2e stand-in for a completed
 * popup sign-in: the runtime keys sessions by repo and skips renewal while one
 * is present and unexpired. The `octocat` identity matches the mocked `/user`.
 */
export async function seedDemoSession(page: Page): Promise<void> {
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
	}, DEMO_REPO);
}

export const ABOUT_SOURCE = 'packages/uncial-cms/content/about.json';

export const ABOUT_DOC = {
	type: 'doc',
	version: 1,
	meta: { title: 'About this demo' },
	content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello from the demo repo' }] }]
};

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

export interface InterceptDemoOptions {
	/**
	 * Commit-status states returned by `/commits/:sha/status`, one per poll; the
	 * last entry repeats. Omit to leave the endpoint returning 404 (→ `unknown`).
	 */
	commitStatuses?: Array<'pending' | 'success' | 'failure' | 'error'>;
	/** When true, PUT saves are rejected with 409 to drive the conflict flow. */
	conflictOnPut?: boolean;
}

/** Intercepts api.github.com for the demo site (repo d-flood/uncial). */
export async function interceptDemoGitHub(
	page: Page,
	opts: InterceptDemoOptions = {}
): Promise<{ puts: RecordedPut[] }> {
	const puts: RecordedPut[] = [];
	let statusCall = 0;

	await page.route('https://api.github.com/**', async (route: Route) => {
		const request = route.request();
		const url = new URL(request.url());

		if (url.pathname === '/user') {
			await route.fulfill({ json: { login: 'octocat', id: 583231, name: 'Octo Cat' } });
			return;
		}

		if (/^\/repos\/d-flood\/uncial\/commits\/.+\/status$/.test(url.pathname)) {
			const states = opts.commitStatuses;
			if (states && states.length > 0) {
				const state = states[Math.min(statusCall, states.length - 1)]!;
				statusCall += 1;
				await route.fulfill({ json: { state } });
				return;
			}
			await route.fulfill({ status: 404, json: { message: 'Not Found' } });
			return;
		}

		if (url.pathname === `/repos/d-flood/uncial/contents/${ABOUT_SOURCE}`) {
			if (request.method() === 'GET') {
				const raw = JSON.stringify(ABOUT_DOC);
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

export interface RecordedDelete {
	path: string;
	body: Record<string, unknown>;
}

export const CONTENT_DIR = 'packages/uncial-cms/content';

/**
 * Store-backed api.github.com mock: GET serves files and directory listings
 * from an in-memory map, PUT upserts (recording the body), DELETE removes.
 * Models the demo repo (d-flood/uncial) for the index-page flows.
 */
export async function interceptDemoGitHubWithStore(
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
