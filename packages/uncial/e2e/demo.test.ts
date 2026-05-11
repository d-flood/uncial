import { expect, test } from '@playwright/test';

test('home page shows the styled editor', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Bold' })).toBeVisible();
	await expect(
		page.getByText(
			"Uncial is a backend-agnostic, block-based WYSIWYG editor for Svelte, powered by Tiptap, designed to bridge the gap between authoring and rendering."
		)
	).toBeVisible();
	await expect(page.getByText('Normalized version')).toHaveCount(0);
});

test('clicking rich text focuses the editor surface', async ({ page }) => {
	await page.goto('/');

	const firstLine = page.getByText(
		'Register blocks, create a schema, bind the editor to JSON, and render the same document anywhere.'
	);
	await firstLine.click();

	await expect(page.getByRole('textbox')).toBeFocused();
	await expect(page.getByText('Define a block once.')).toBeVisible();
});

test('editing rich text keeps it out of the block menu', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByText('Rich Text', { exact: true })).toHaveCount(0);

	await page
		.getByText('Register blocks, create a schema, bind the editor to JSON, and render the same document anywhere.')
		.click();
	await page.keyboard.type('!');
	await page.keyboard.press('Backspace');

	await expect(page.getByText('Rich Text', { exact: true })).toHaveCount(0);
});
