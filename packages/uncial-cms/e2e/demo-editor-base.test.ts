import { expect, test } from '@playwright/test';
import { ABOUT_SOURCE, interceptDemoGitHub } from './demo-helpers.js';

// Regression test for PRD §6.1: with the site served under a base path
// (GitHub Pages project-site style), the URL→source mapping must still
// resolve the same repo-relative source — the base is stripped by the router.
test('base-path build maps /uncial/cms-demo/about/edit/ to the same source path', async ({
	page
}) => {
	const { puts } = await interceptDemoGitHub(page);
	page.on('dialog', (dialog) => void dialog.accept('ghp_e2e_test_token'));

	await page.goto('/uncial/cms-demo/about/edit/');

	const editor = page.locator('uncial-editor .ProseMirror');
	await expect(editor).toContainText('Hello from the demo repo');
	await expect(page.getByRole('status')).toContainText(`Editing ${ABOUT_SOURCE} as octocat`);

	await editor.click();
	await page.keyboard.press('End');
	await page.keyboard.type(' — edited under a base path');

	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status')).toContainText('Committed to main');

	expect(puts).toHaveLength(1);
	expect(puts[0]!.path).toBe(ABOUT_SOURCE);
});
