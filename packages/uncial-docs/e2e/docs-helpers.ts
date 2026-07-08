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

function toBase64(text: string): string {
	return Buffer.from(text, 'utf-8').toString('base64');
}

/** Intercepts api.github.com for the docs site, serving the getting-started doc. */
export async function interceptDocsGitHub(page: Page): Promise<void> {
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
		}

		await route.fulfill({ status: 404, json: { message: 'Not Found' } });
	});
}
