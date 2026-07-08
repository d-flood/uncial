import { expect, test } from '@playwright/test';
import { ABOUT_SOURCE, fromBase64, interceptDemoGitHub } from './demo-helpers.js';

test('editor variant loads, edits, and commits to the mapped source path', async ({ page }) => {
	const { puts } = await interceptDemoGitHub(page);
	page.on('dialog', (dialog) => void dialog.accept('ghp_e2e_test_token'));

	await page.goto('/about/edit/');

	const editor = page.locator('uncial-editor .ProseMirror');
	await expect(editor).toContainText('Hello from the demo repo');
	await expect(page.getByRole('status')).toContainText(`Editing ${ABOUT_SOURCE} as octocat`);

	await editor.click();
	await page.keyboard.press('End');
	await page.keyboard.type(' — edited in e2e');

	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status')).toContainText('Saved as commit 1234567');

	expect(puts).toHaveLength(1);
	expect(puts[0]!.path).toBe(ABOUT_SOURCE);
	expect(puts[0]!.body.branch).toBe('main');
	const saved = JSON.parse(fromBase64(String(puts[0]!.body.content)));
	expect(JSON.stringify(saved)).toContain('edited in e2e');
});

test('content page renders without any editor chrome', async ({ page }) => {
	await page.goto('/about/');
	await expect(page.locator('h1')).toContainText('About this demo');
	await expect(page.locator('uncial-editor')).toHaveCount(0);
});

test('site index shell shows the baked repo config', async ({ page }) => {
	await page.goto('/uncial/');
	await expect(page.locator('h1')).toContainText('Site index');
	await expect(page.locator('main')).toContainText('d-flood/uncial');
});
