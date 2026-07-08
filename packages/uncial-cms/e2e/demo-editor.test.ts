import { expect, test } from '@playwright/test';
import { ABOUT_SOURCE, fromBase64, interceptDemoGitHub } from './demo-helpers.js';

test('editor variant loads, edits, and commits to the mapped source path', async ({ page }) => {
	const { puts } = await interceptDemoGitHub(page);
	page.on('dialog', (dialog) => void dialog.accept('ghp_e2e_test_token'));

	await page.goto('/about/edit/');

	const editor = page.locator('uncial-editor .ProseMirror');
	await expect(editor).toContainText('Hello from the demo repo');
	await expect(page.getByRole('status')).toContainText(`Editing ${ABOUT_SOURCE} as octocat`);

	// The editor renders in a shadow root: the page's stylesheets must be
	// mirrored inside it or the editor UI renders unstyled.
	const shadowStylesheets = await page
		.locator('uncial-editor')
		.evaluate((el) => el.shadowRoot?.querySelectorAll('link[rel="stylesheet"]').length ?? 0);
	expect(shadowStylesheets).toBeGreaterThan(0);

	await editor.click();
	await page.keyboard.press('End');
	await page.keyboard.type(' — edited in e2e');

	await page.getByRole('button', { name: 'Save' }).click();
	// The save lands as a commit; the deploy-status line names the branch.
	await expect(page.getByRole('status')).toContainText('Committed to main');

	expect(puts).toHaveLength(1);
	expect(puts[0]!.path).toBe(ABOUT_SOURCE);
	expect(puts[0]!.body.branch).toBe('main');
	const saved = JSON.parse(fromBase64(String(puts[0]!.body.content)));
	expect(JSON.stringify(saved)).toContain('edited in e2e');
});

test('deploy status polls pending → success and shows building… then live', async ({ page }) => {
	await interceptDemoGitHub(page, { commitStatuses: ['pending', 'success'] });
	page.on('dialog', (dialog) => void dialog.accept('ghp_e2e_test_token'));

	await page.goto('/about/edit/');
	await expect(page.locator('uncial-editor .ProseMirror')).toContainText('Hello from the demo repo');

	await page.getByRole('button', { name: 'Save' }).click();

	// First poll (pending) → building…; second poll (success) → live. Real
	// product timings are 3s then +10s, so allow generous windows.
	const status = page.getByRole('status');
	await expect(status).toContainText('building…', { timeout: 8_000 });
	await expect(status).toContainText('Live on main', { timeout: 20_000 });
	// The live status offers a commit permalink on the forge.
	await expect(status.getByRole('link', { name: 'View commit' })).toHaveAttribute(
		'href',
		/github\.com\/d-flood\/uncial\/commit\//
	);
});

test('a 409 on save opens the conflict banner and never loses the edit', async ({ page }) => {
	await interceptDemoGitHub(page, { conflictOnPut: true });
	page.on('dialog', (dialog) => void dialog.accept('ghp_e2e_test_token'));

	await page.goto('/about/edit/');
	const editor = page.locator('uncial-editor .ProseMirror');
	await expect(editor).toContainText('Hello from the demo repo');

	await editor.click();
	await page.keyboard.press('End');
	await page.keyboard.type(' — conflicting edit');
	await expect(editor).toContainText('conflicting edit');

	await page.getByRole('button', { name: 'Save' }).click();

	const banner = page.getByRole('alert');
	await expect(banner).toContainText('changed on main');

	// Action (a): download my version — the unsaved document as a .json file.
	const downloadPromise = page.waitForEvent('download');
	await banner.getByRole('button', { name: 'Download my version' }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe('about.json');

	// Downloading (and dismissing) must not discard the in-progress edit.
	await banner.getByRole('button', { name: 'Dismiss' }).click();
	await expect(banner).toBeHidden();
	await expect(editor).toContainText('conflicting edit');
	await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
});

test('conflict banner reload replaces the editor content after confirm', async ({ page }) => {
	await interceptDemoGitHub(page, { conflictOnPut: true });
	// Accept every dialog: the PAT prompt (with a token) and the reload confirm.
	page.on('dialog', (dialog) => void dialog.accept('ghp_e2e_test_token'));

	await page.goto('/about/edit/');
	const editor = page.locator('uncial-editor .ProseMirror');
	await expect(editor).toContainText('Hello from the demo repo');

	await editor.click();
	await page.keyboard.press('End');
	await page.keyboard.type(' — will be discarded');

	await page.getByRole('button', { name: 'Save' }).click();
	const banner = page.getByRole('alert');
	await expect(banner).toContainText('changed on main');

	// Action (b): reload latest — refetches the document, discarding the edit.
	await banner.getByRole('button', { name: 'Reload latest' }).click();
	await expect(banner).toBeHidden();
	await expect(editor).toContainText('Hello from the demo repo');
	await expect(editor).not.toContainText('will be discarded');
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
