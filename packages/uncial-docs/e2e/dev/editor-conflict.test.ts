import { expect, test } from '@playwright/test';
import {
	GETTING_STARTED_FILE,
	GETTING_STARTED_TEXT,
	readDoc,
	restoreDoc
} from './dev-helpers.js';

const UNDERNEATH_TEXT = 'Rewritten underneath the open editor';

const UNDERNEATH_DOC = JSON.stringify(
	{
		type: 'doc',
		version: 1,
		meta: { title: 'Getting started', navGroup: 'Getting started', navOrder: 1 },
		content: [{ type: 'paragraph', content: [{ type: 'text', text: UNDERNEATH_TEXT }] }]
	},
	null,
	'\t'
);

test('a conflict blocks the save and offers download, reload and dismiss', async ({ page }) => {
	const original = readDoc(GETTING_STARTED_FILE);

	try {
		await page.goto('/getting-started/edit/');

		const editor = page.locator('.uncial-cms-editor-page .ProseMirror');
		await expect(editor).toContainText(GETTING_STARTED_TEXT);

		// The document changes on disk after the editor read it, so the autosave
		// below writes against a stale revision.
		restoreDoc(GETTING_STARTED_FILE, UNDERNEATH_DOC);

		await editor.click();
		await page.keyboard.press('End');
		await page.keyboard.type('!');

		const banner = page.getByRole('alert');
		await expect(banner).toContainText('changed on the local checkout');
		await expect(banner.getByRole('button', { name: 'Download my version' })).toBeVisible();
		await expect(banner.getByRole('button', { name: 'Reload latest' })).toBeVisible();

		await banner.getByRole('button', { name: 'Dismiss' }).click();
		await expect(banner).toBeHidden();

		// The stale revision is still the one the editor holds, so the next edit
		// raises the banner again — this time to reload from it.
		await editor.click();
		await page.keyboard.press('End');
		await page.keyboard.type('!');
		await expect(banner).toBeVisible();

		// Reload discards the unsaved edit for what is on disk, behind a confirm.
		page.once('dialog', (dialog) => void dialog.accept());
		await banner.getByRole('button', { name: 'Reload latest' }).click();
		await expect(editor).toContainText(UNDERNEATH_TEXT);
	} finally {
		restoreDoc(GETTING_STARTED_FILE, original);
	}
});
