import { expect, test } from '@playwright/test';

test('wide rendered tables scroll within their container', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 800 });
	await page.goto('/');
	await page.getByRole('tab', { name: 'Rendered' }).click();

	const tableScroll = page.locator('.uncial-table-scroll');
	await expect(tableScroll).toBeVisible();
	expect(await tableScroll.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
		true
	);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);

	await tableScroll.evaluate((element) => {
		element.scrollLeft = 100;
	});
	await expect.poll(() => tableScroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});
