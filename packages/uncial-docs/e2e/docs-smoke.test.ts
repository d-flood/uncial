import { expect, test } from '@playwright/test';
import {
	GETTING_STARTED_SOURCE,
	GETTING_STARTED_TEXT,
	interceptDocsGitHub,
	seedDocsSession
} from './docs-helpers.js';

test('content page renders the Docs document without any editor chrome', async ({ page }) => {
	await page.goto('/getting-started/');

	await expect(page.locator('main h1')).toContainText('Getting started');
	await expect(page.getByRole('heading', { name: GETTING_STARTED_TEXT })).toBeVisible();
	// Production content page ships no uncial-cms runtime: no editor page.
	await expect(page.locator('.uncial-cms-editor-page')).toHaveCount(0);
});

test('the sidebar files the static-site guide under Guides and reaches it', async ({ page }) => {
	await page.goto('/getting-started/');

	const nav = page.getByRole('navigation', { name: 'Docs navigation' });
	await nav.getByRole('link', { name: 'A static site that edits itself' }).click();

	await expect(page).toHaveURL(/\/static-site\/$/);
	await expect(page.locator('main h1')).toContainText('A static site that edits itself');
	await expect(page.getByRole('heading', { name: 'The first committed edit' })).toBeVisible();
});

test('editor variant mounts the WYSIWYG editor with the live document', async ({ page }) => {
	await interceptDocsGitHub(page);
	await seedDocsSession(page);

	await page.goto('/getting-started/edit/');

	const editor = page.locator('.uncial-cms-editor-page .ProseMirror');
	await expect(editor).toContainText(GETTING_STARTED_TEXT);
	await expect(page.getByRole('status')).toContainText(
		`Editing ${GETTING_STARTED_SOURCE} as octocat`
	);
});

test('site index shell shows the baked repo config', async ({ page }) => {
	await page.goto('/uncial/');

	await expect(page.locator('main h1')).toContainText('Site index');
	await expect(page.locator('main')).toContainText('d-flood/uncial');
});
