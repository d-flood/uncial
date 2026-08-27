import { expect, test } from '@playwright/test';

test('tab groups on one page keep their selections independent', async ({ page }) => {
	await page.goto('/tabs/');

	const frameworkTabs = page.getByRole('tablist', { name: 'framework tabs' });
	const packageManagerTabs = page.getByRole('tablist', { name: 'package-manager tabs' });

	await packageManagerTabs.getByRole('tab', { name: 'pnpm' }).click();
	await expect(page.getByRole('tabpanel', { name: 'pnpm' })).toBeVisible();

	await frameworkTabs.getByRole('tab', { name: 'Vue' }).click();
	await expect(page.getByRole('tabpanel', { name: 'Vue' })).toBeVisible();
	await expect(page.getByRole('tabpanel', { name: 'pnpm' })).toBeVisible();
});

test('a tab group keeps its selection after navigation', async ({ page }) => {
	await page.goto('/tabs/');

	await page
		.getByRole('tablist', { name: 'framework tabs' })
		.getByRole('tab', { name: 'Vue' })
		.click();
	await page.getByRole('link', { name: 'Next tab page' }).click();

	await expect(page).toHaveURL(/\/tabs\/next\/?$/);
	await page.reload();
	await expect(
		page.getByRole('tablist', { name: 'framework tabs' }).getByRole('tab', { name: 'Vue' })
	).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('tabpanel', { name: 'Vue' })).toBeVisible();
});

test('an unavailable stored tab falls back to the first tab', async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem('uncial-tabs:framework', 'Lit');
	});
	await page.goto('/tabs/');

	const frameworkTabs = page.getByRole('tablist', { name: 'framework tabs' });
	await expect(frameworkTabs.getByRole('tab', { name: 'React' })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(page.getByRole('tabpanel', { name: 'React' })).toBeVisible();
});
