import type { Page, Route } from '@playwright/test';

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

/** Intercepts api.github.com for the demo site (repo d-flood/uncial). */
export async function interceptDemoGitHub(page: Page): Promise<{ puts: RecordedPut[] }> {
	const puts: RecordedPut[] = [];

	await page.route('https://api.github.com/**', async (route: Route) => {
		const request = route.request();
		const url = new URL(request.url());

		if (url.pathname === '/user') {
			await route.fulfill({ json: { login: 'octocat', id: 583231, name: 'Octo Cat' } });
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
