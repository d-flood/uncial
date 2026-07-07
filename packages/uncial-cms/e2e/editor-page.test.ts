import { expect, test, type Page, type Route } from '@playwright/test';

const FIXTURE_DOC = {
	type: 'doc',
	version: 1,
	content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello from GitHub' }] }]
};

function toBase64(text: string): string {
	return Buffer.from(text, 'utf-8').toString('base64');
}

function fromBase64(base64: string): string {
	return Buffer.from(base64, 'base64').toString('utf-8');
}

async function interceptGitHub(page: Page): Promise<{ puts: Array<Record<string, unknown>> }> {
	const puts: Array<Record<string, unknown>> = [];

	await page.route('https://api.github.com/**', async (route: Route) => {
		const request = route.request();
		const url = new URL(request.url());

		if (url.pathname === '/user') {
			await route.fulfill({
				json: { login: 'octocat', id: 583231, name: 'Octo Cat' }
			});
			return;
		}

		if (url.pathname === '/repos/octo/site/contents/content/fixture.json') {
			if (request.method() === 'GET') {
				const raw = JSON.stringify(FIXTURE_DOC);
				await route.fulfill({
					json: {
						content: toBase64(raw),
						encoding: 'base64',
						sha: 'sha-original',
						size: raw.length
					}
				});
				return;
			}
			if (request.method() === 'PUT') {
				puts.push(request.postDataJSON() as Record<string, unknown>);
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

test('loads a document with a PAT, edits it, and saves the edit as a commit', async ({ page }) => {
	const { puts } = await interceptGitHub(page);
	page.on('dialog', (dialog) => void dialog.accept('ghp_e2e_test_token'));

	await page.goto('/');

	const editor = page.locator('uncial-editor .ProseMirror');
	await expect(editor).toContainText('Hello from GitHub');
	await expect(page.getByRole('status')).toContainText('Editing content/fixture.json as octocat');

	await editor.click();
	await page.keyboard.press('End');
	await page.keyboard.type(' — edited in e2e');
	await expect(editor).toContainText('Hello from GitHub — edited in e2e');

	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status')).toContainText('Saved as commit 1234567');

	expect(puts).toHaveLength(1);
	const put = puts[0]!;
	expect(put.sha).toBe('sha-original');
	expect(put.branch).toBe('main');
	expect(put.message).toBe('Update content/fixture.json via uncial-cms');
	expect(put.author).toEqual({
		name: 'Octo Cat',
		email: '583231+octocat@users.noreply.github.com'
	});
	const savedDocument = JSON.parse(fromBase64(String(put.content)));
	expect(savedDocument.content).toEqual([
		{
			type: 'paragraph',
			content: [{ type: 'text', text: 'Hello from GitHub — edited in e2e' }]
		}
	]);
});

test('surfaces a conflict banner when the save is rejected with 409', async ({ page }) => {
	await page.route('https://api.github.com/**', async (route: Route) => {
		const request = route.request();
		const url = new URL(request.url());

		if (url.pathname === '/user') {
			await route.fulfill({ json: { login: 'octocat', id: 583231, name: 'Octo Cat' } });
			return;
		}
		if (request.method() === 'GET' && url.pathname.endsWith('/contents/content/fixture.json')) {
			const raw = JSON.stringify(FIXTURE_DOC);
			await route.fulfill({
				json: { content: toBase64(raw), encoding: 'base64', sha: 'sha-original', size: raw.length }
			});
			return;
		}
		if (request.method() === 'PUT') {
			await route.fulfill({ status: 409, json: { message: 'sha mismatch' } });
			return;
		}
		await route.fulfill({ status: 404, json: { message: 'Not Found' } });
	});
	page.on('dialog', (dialog) => void dialog.accept('ghp_e2e_test_token'));

	await page.goto('/');
	await expect(page.locator('uncial-editor .ProseMirror')).toContainText('Hello from GitHub');

	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByRole('alert')).toContainText('changed on main');
});
