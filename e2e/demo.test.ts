import { expect, test } from '@playwright/test';

test('home page shows the styled editor', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Bold' })).toBeVisible();
	await expect(
		page.getByText(
			'Plain rich text now lives directly in the document beside custom container blocks.'
		)
	).toBeVisible();
	await expect(page.getByText('Normalized version')).toHaveCount(0);
});

test('clicking rich text focuses the editor surface', async ({ page }) => {
	await page.goto('/');

	const firstLine = page.getByText(
		'Edit this document and use the toolbar to insert or configure blocks.'
	);
	await firstLine.click();

	await expect(page.getByRole('textbox')).toBeFocused();
	await expect(page.getByText('Launch Checklist')).toBeVisible();
});

test('editing rich text keeps it out of the block menu', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByText('Rich Text', { exact: true })).toHaveCount(0);

	await page
		.getByText('Edit this document and use the toolbar to insert or configure blocks.')
		.click();
	await page.keyboard.type('!');
	await page.keyboard.press('Backspace');

	await expect(page.getByText('Rich Text', { exact: true })).toHaveCount(0);
});
