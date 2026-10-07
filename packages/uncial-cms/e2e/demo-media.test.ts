import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
	ABOUT_DOC,
	ABOUT_SOURCE,
	CONTENT_DIR,
	interceptDemoGitHubWithStore,
	seedDemoSession
} from './demo-helpers.js';

const MEDIA_DIR = 'packages/uncial-cms/static/uploads';
const PIXEL = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
	'base64'
);
const FOLIO = `${'f'.repeat(32)}.png`;
const PLATE = `${'b'.repeat(32)}.png`;

const docUsing = (src: string) =>
	JSON.stringify({
		...ABOUT_DOC,
		content: [...ABOUT_DOC.content, { type: 'image', attrs: { src, alt: 'Folio' } }]
	});

const FILES = {
	[`${CONTENT_DIR}/index.json`]: JSON.stringify(ABOUT_DOC),
	[ABOUT_SOURCE]: JSON.stringify(ABOUT_DOC),
	[`${CONTENT_DIR}/team/alice.json`]: docUsing(`/uploads/${FOLIO}`),
	[`${MEDIA_DIR}/${FOLIO}`]: 'folio bytes',
	[`${MEDIA_DIR}/${PLATE}`]: 'plate bytes'
};

const card = (page: import('@playwright/test').Page, filename: string) =>
	page.getByRole('listitem').filter({ hasText: filename });

test('an upload appears in the grid, and an unused file deletes after a plain confirmation', async ({
	page
}) => {
	const { puts, deletes } = await interceptDemoGitHubWithStore(page, { ...FILES });
	await seedDemoSession(page);

	await page.goto('/uncial/#/media');
	await expect(page.getByRole('heading', { name: 'Media' })).toBeVisible();
	await expect(card(page, FOLIO)).toBeVisible();

	await page
		.locator('input[type=file]')
		.setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: PIXEL });

	await expect.poll(() => puts.length, { message: 'upload committed' }).toBe(1);
	const uploaded = puts[0]!.path;
	expect(uploaded).toMatch(new RegExp(`^${MEDIA_DIR}/[0-9a-f]{32}\\.png$`));
	expect(puts[0]!.body.message).toBe(`uncial-cms: upload ${uploaded}`);
	const filename = uploaded.slice(MEDIA_DIR.length + 1);
	await expect(card(page, filename)).toBeVisible();
	await expect(card(page, filename).getByRole('link', { name: `Open ${filename}` })).toHaveAttribute(
		'href',
		`/uploads/${filename}`
	);

	await card(page, filename).getByRole('button', { name: `Delete ${filename}` }).click();
	const confirm = page.getByRole('dialog', { name: 'Delete this file?' });
	await expect(confirm).toContainText(`Delete ${filename} from main?`);
	await confirm.getByRole('button', { name: 'Delete' }).click();

	await expect.poll(() => deletes.length, { message: 'DELETE commit recorded' }).toBe(1);
	expect(deletes[0]!.path).toBe(uploaded);
	await expect(card(page, filename)).toHaveCount(0);
	await expect(page.getByRole('region', { name: 'Media library' })).toBeFocused();
	await expect(page.getByText(/in use/i)).toHaveCount(0);
	await expect(page.getByRole('searchbox')).toHaveCount(0);
});

test('deleting a file a page uses warns with that page, and Escape keeps it', async ({ page }) => {
	const { deletes } = await interceptDemoGitHubWithStore(page, { ...FILES });
	await seedDemoSession(page);

	await page.goto('/uncial/#/media');
	const remove = card(page, FOLIO).getByRole('button', { name: `Delete ${FOLIO}` });
	await remove.click();

	const warning = page.getByRole('dialog', { name: 'This file is in use' });
	await expect(warning.getByRole('listitem')).toHaveText(['/team/alice/']);
	await expect(warning.getByRole('button', { name: 'Cancel' })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(warning).toHaveCount(0);
	await expect(remove).toBeFocused();

	await page.keyboard.press('Enter');
	await warning.getByRole('button', { name: 'Delete anyway' }).click();
	await expect.poll(() => deletes.length, { message: 'DELETE commit recorded' }).toBe(1);
	expect(deletes[0]!.path).toBe(`${MEDIA_DIR}/${FOLIO}`);
	await expect(card(page, FOLIO)).toHaveCount(0);

	await card(page, PLATE).getByRole('button', { name: `Delete ${PLATE}` }).click();
	await expect(page.getByRole('dialog', { name: 'Delete this file?' })).toBeVisible();
});

for (const width of [390, 1280]) {
	test(`#/media has no WCAG 2.1 A/AA violations at ${width}px`, async ({ page }) => {
		await interceptDemoGitHubWithStore(page, { ...FILES });
		await seedDemoSession(page);
		await page.setViewportSize({ width, height: 900 });

		await page.goto('/uncial/#/media');
		await expect(card(page, PLATE)).toBeVisible();
		const grid = page.locator('.uncial-cms-media-grid');
		const columns = () =>
			grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
		if (width < 640) await expect.poll(columns).toBe(1);
		else await expect.poll(columns).toBeGreaterThan(1);

		const scan = () =>
			new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
		expect((await scan()).violations).toEqual([]);

		await card(page, FOLIO).getByRole('button', { name: `Delete ${FOLIO}` }).click();
		await expect(page.getByRole('dialog', { name: 'This file is in use' })).toBeVisible();
		expect((await scan()).violations).toEqual([]);
	});
}
