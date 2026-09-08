import { expect, test } from '@playwright/test';
import {
	GETTING_STARTED_FILE,
	GETTING_STARTED_TEXT,
	readDoc,
	restoreDoc
} from './dev-helpers.js';

test('an edit round trips to disk without a Save button', async ({ page }) => {
	const original = readDoc(GETTING_STARTED_FILE);
	const sentence = ` Autosaved by the round-trip test ${Date.now()}.`;

	try {
		await page.goto('/getting-started/edit/');

		const editor = page.locator('.uncial-cms-editor-page .ProseMirror');
		await expect(editor).toContainText(GETTING_STARTED_TEXT);

		// Autosave is the local forge's mode, so there is nothing to press.
		await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);

		await editor.click();
		await page.keyboard.press('End');
		await page.keyboard.type(sentence);

		await expect
			.poll(() => readDoc(GETTING_STARTED_FILE), {
				message: 'autosave writes the edit to the checkout',
				timeout: 15_000
			})
			.toContain(sentence.trim());

		await expect(page.getByRole('status')).toContainText('Committed to the local checkout');
	} finally {
		restoreDoc(GETTING_STARTED_FILE, original);
	}
});
