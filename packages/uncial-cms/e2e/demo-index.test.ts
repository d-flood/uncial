import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
	ABOUT_DOC,
	ABOUT_SOURCE,
	CONTENT_DIR,
	DEMO_REPO,
	fromBase64,
	interceptDemoGitHubWithStore,
	seedDemoSession
} from './demo-helpers.js';

const INITIAL_FILES = {
	[`${CONTENT_DIR}/index.json`]: JSON.stringify(ABOUT_DOC),
	[ABOUT_SOURCE]: JSON.stringify(ABOUT_DOC)
};

function autoAcceptDialogs(page: Page): void {
	// Sign-in is seeded via seedDemoSession (popup default, no prompt); the only
	// dialogs the index raises are confirms: delete and the unsaved-changes guard.
	page.on('dialog', (dialog) => void dialog.accept());
}

test('create → fallback edit → delete round-trip from /uncial/', async ({ page }) => {
	const { puts, deletes } = await interceptDemoGitHubWithStore(page, { ...INITIAL_FILES });
	autoAcceptDialogs(page);
	await seedDemoSession(page);

	await page.goto('/uncial/');
	await expect(page.getByRole('status')).toContainText('as octocat');

	// Create: validated path input seeds the document and opens the fallback editor.
	await page.getByLabel('New page path').fill('team/new-page');
	await page.getByRole('button', { name: 'Create page' }).click();

	await expect(page).toHaveURL(/#\/team\/new-page\/$/);
	const editor = page.locator('uncial-editor .ProseMirror');
	await expect(editor).toBeVisible();

	expect(puts).toHaveLength(1);
	const createPut = puts[0]!;
	expect(createPut.path).toBe(`${CONTENT_DIR}/team/new-page.json`);
	expect(createPut.body.sha).toBeUndefined(); // create mode: no sha
	expect(createPut.body.message).toBe('uncial-cms: create team/new-page');
	const seeded = JSON.parse(fromBase64(String(createPut.body.content)));
	expect(seeded.type).toBe('doc');

	// The just-created page is editable before any deploy completes.
	await editor.click();
	await page.keyboard.type('Fresh page body');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status').last()).toContainText('Committed to main');

	expect(puts).toHaveLength(2);
	const editPut = puts[1]!;
	expect(editPut.path).toBe(`${CONTENT_DIR}/team/new-page.json`);
	expect(editPut.body.sha).toBe('sha-1'); // edit mode: sha from the create commit
	expect(editPut.body.message).toBe('uncial-cms: edit team/new-page');

	// Back to the list; the new page shows up and can be deleted.
	await page.getByRole('link', { name: '← Back to index' }).click();
	const row = page.locator('li', { hasText: '/team/new-page/' });
	await expect(row).toBeVisible();
	await row.getByRole('button', { name: 'Delete' }).click();

	await expect
		.poll(() => deletes.length, { message: 'DELETE commit recorded' })
		.toBe(1);
	expect(deletes[0]!.path).toBe(`${CONTENT_DIR}/team/new-page.json`);
	expect(deletes[0]!.body.message).toBe('uncial-cms: delete team/new-page');
	expect(deletes[0]!.body.sha).toBe('sha-2');
	await expect(page.locator('li', { hasText: '/team/new-page/' })).toHaveCount(0);
});

test('create on an existing path is rejected before any commit', async ({ page }) => {
	const { puts } = await interceptDemoGitHubWithStore(page, { ...INITIAL_FILES });
	autoAcceptDialogs(page);
	await seedDemoSession(page);

	await page.goto('/uncial/');
	await expect(page.getByRole('status')).toContainText('as octocat');

	await page.getByLabel('New page path').fill('about');
	await page.getByRole('button', { name: 'Create page' }).click();
	await expect(page.getByRole('alert')).toContainText('already exists');

	await page.getByLabel('New page path').fill('Not A Valid Path');
	await page.getByRole('button', { name: 'Create page' }).click();
	await expect(page.getByRole('alert')).toContainText('lowercase');

	expect(puts).toHaveLength(0);
});

test('fallback editor at #/about/ commits to the same source as /about/edit/', async ({
	page
}) => {
	const { puts } = await interceptDemoGitHubWithStore(page, { ...INITIAL_FILES });
	autoAcceptDialogs(page);
	await seedDemoSession(page);

	await page.goto('/uncial/#/about/');
	const editor = page.locator('uncial-editor .ProseMirror');
	await expect(editor).toContainText('Hello from the demo repo');

	await editor.click();
	await page.keyboard.press('End');
	await page.keyboard.type(' — via fallback');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status').last()).toContainText('Committed to main');

	expect(puts).toHaveLength(1);
	expect(puts[0]!.path).toBe(ABOUT_SOURCE); // identical PUT path to /about/edit/
	expect(puts[0]!.body.message).toBe('uncial-cms: edit about');
});

test('a blocked sign-in popup can be retried from the Sign in button', async ({ page }) => {
	await interceptDemoGitHubWithStore(page, { ...INITIAL_FILES });
	// Browsers block a popup opened outside a click, which is how the index's
	// first sign-in attempt runs.
	await page.addInitScript(() => {
		window.open = () => null;
	});

	await page.goto('/uncial/');
	await expect(page.getByRole('status')).toContainText('popup was blocked');
	const signIn = page.getByRole('button', { name: 'Sign in' });
	await expect(signIn).toBeVisible();

	await page.evaluate((repo) => {
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
	await signIn.click();

	await expect(page.getByRole('status')).toContainText('as octocat');
	await expect(signIn).toBeHidden();
	await expect(page.locator('li', { hasText: '/about/' })).toBeVisible();
});
