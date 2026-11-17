import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
	CONTENT_DIR,
	fromBase64,
	interceptDemoGitHubWithStore,
	seedDemoSession
} from './demo-helpers.js';

const FOOTER_SOURCE = `${CONTENT_DIR}/_globals/footer.json`;
const FOOTER = {
	type: 'doc',
	version: 1,
	meta: {
		note: 'Made in Dallas',
		columns: [
			{ heading: 'About', links: [{ label: 'Team', href: '/team/' }] },
			{
				heading: 'Visit',
				links: [
					{ label: 'Hours', href: '/hours/' },
					{ label: 'Map', href: '/map/' }
				]
			}
		]
	},
	content: []
};
const STATES = 'packages/uncial-cms/states';
const state = (name: string, capital: string) =>
	JSON.stringify({ type: 'doc', version: 1, meta: { name, capital }, content: [] });
const FILES = {
	[FOOTER_SOURCE]: JSON.stringify(FOOTER),
	[`${STATES}/texas.json`]: state('Texas', 'Austin'),
	[`${STATES}/ohio.json`]: state('Ohio', 'Columbus')
};

const column = (page: Page, n: number) =>
	page.locator('.uncial-list-item').filter({ has: page.getByText(`column ${n}`, { exact: true }) });
const link = (page: Page, inColumn: number, n: number) =>
	column(page, inColumn)
		.locator('.uncial-list-item')
		.filter({ has: page.getByText(`link ${n}`, { exact: true }) });
const formStatus = (page: Page) => page.getByRole('status').last();
const scan = (page: Page) =>
	new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

test('the Globals list opens the demo Global, refuses an invalid link, and a fixed edit commits and goes live', async ({
	page
}) => {
	const { puts } = await interceptDemoGitHubWithStore(page, FILES, {
		commitStatuses: ['pending', 'success']
	});
	await seedDemoSession(page);

	await page.goto('/uncial/#/globals');
	const entry = page.getByRole('listitem').filter({ hasText: 'footer' });
	await expect(entry).toContainText('Site footer');
	await entry.getByRole('link', { name: 'footer' }).click();

	await expect(page).toHaveURL(/#\/globals\/footer$/);
	await expect(page.getByRole('heading', { name: 'Site footer' })).toBeFocused();
	await expect(link(page, 2, 2).getByLabel('label')).toHaveValue('Map');

	await link(page, 2, 2).getByLabel('href').fill('map');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(formStatus(page)).toHaveText('Not saved: 1 field needs fixing.');
	await expect(
		link(page, 2, 2).getByText('Metadata field "columns.1.links.1.href" is invalid')
	).toBeVisible();
	expect(puts).toHaveLength(0);

	await link(page, 2, 2).getByLabel('href').fill('/map/');
	await link(page, 2, 2).getByLabel('label').fill('Directions');
	await column(page, 2).getByRole('button', { name: 'Add link' }).click();
	await link(page, 2, 3).getByLabel('label').fill('Parking');
	await link(page, 2, 3).getByLabel('href').fill('/parking/');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(formStatus(page)).toContainText('Committed to main');
	expect(puts.map(({ path, body }) => [path, body.sha, body.message])).toEqual([
		[FOOTER_SOURCE, 'sha-original', 'uncial-cms: save global footer']
	]);
	const saved = JSON.parse(fromBase64(String(puts[0]!.body.content)));
	expect(saved).toMatchObject({ content: [] });
	expect(saved.meta).toEqual({
		note: 'Made in Dallas',
		columns: [
			FOOTER.meta.columns[0],
			{
				heading: 'Visit',
				links: [
					{ label: 'Hours', href: '/hours/' },
					{ label: 'Directions', href: '/map/' },
					{ label: 'Parking', href: '/parking/' }
				]
			}
		]
	});

	await expect(formStatus(page)).toContainText('building…', { timeout: 8_000 });
	await expect(formStatus(page)).toContainText('Live on main', { timeout: 20_000 });
});

test('a stale save shows the conflict banner, keeps the edit, and reload latest saves cleanly', async ({
	page
}) => {
	const { puts, commitElsewhere } = await interceptDemoGitHubWithStore(page, FILES);
	await seedDemoSession(page);

	await page.goto('/uncial/#/globals/footer');
	const note = page.getByLabel('note');
	await expect(note).toHaveValue('Made in Dallas');

	const theirs = { ...FOOTER, meta: { ...FOOTER.meta, note: 'Made in Fort Worth' } };
	commitElsewhere(FOOTER_SOURCE, JSON.stringify(theirs));
	await note.fill('Made in Denton');
	await page.getByRole('button', { name: 'Save' }).click();

	const banner = page.getByRole('alert');
	await expect(banner).toContainText('footer changed on main since you loaded it');
	await expect(note).toHaveValue('Made in Denton');
	expect(puts).toHaveLength(0);

	const downloading = page.waitForEvent('download');
	await banner.getByRole('button', { name: 'Download my version' }).click();
	const download = await downloading;
	expect(download.suggestedFilename()).toBe('footer.json');
	expect(JSON.parse(await readFile(await download.path(), 'utf-8')).meta.note).toBe(
		'Made in Denton'
	);

	await banner.getByRole('button', { name: 'Reload latest' }).click();
	const confirm = page.getByRole('dialog', { name: 'Reload the latest version?' });
	await confirm.getByRole('button', { name: 'Reload latest' }).click();
	await expect(banner).toBeHidden();
	await expect(note).toHaveValue('Made in Fort Worth');
	await expect(page.getByRole('heading', { name: 'Site footer' })).toBeFocused();

	await note.fill('Made in Fort Worth and Dallas');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(formStatus(page)).toContainText('Committed to main');
	expect(puts).toHaveLength(1);
	expect(puts[0]!.body.sha).toMatch(/^sha-elsewhere-/);
});

test('the States Collection lists, creates, edits and deletes records', async ({ page }) => {
	const { puts, deletes } = await interceptDemoGitHubWithStore(page, FILES);
	await seedDemoSession(page);

	await page.goto('/uncial/');
	const nav = page.getByRole('navigation', { name: 'Dashboard' });
	await expect(nav.getByRole('link')).toHaveText(['Pages', 'Media', 'Globals', 'States', /^/, /^/]);
	await nav.getByRole('link', { name: 'States' }).click();
	await expect(page).toHaveURL(/#\/collections\/states$/);
	const slugs = page.getByRole('link', { name: /^[a-z]+$/ });
	await expect(slugs).toHaveText(['ohio', 'texas']);
	await expect(page.getByRole('listitem').filter({ hasText: 'ohio' })).toContainText('Ohio');

	await page.getByLabel('New record slug').fill('New York');
	await page.getByRole('button', { name: 'Create record' }).click();
	await expect(page.getByRole('alert')).toContainText('Enter a slug of lowercase letters');
	await page.getByLabel('New record slug').fill('maine');
	await page.getByRole('button', { name: 'Create record' }).click();
	await expect(page).toHaveURL(/#\/collections\/states\/maine$/);
	await expect(page.getByRole('heading', { name: 'States: maine' })).toBeFocused();
	await page.getByLabel('name').fill('Maine');
	await page.getByLabel('capital').fill('Augusta');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(formStatus(page)).toContainText('Committed to main');
	expect(puts.map(({ path, body }) => [path, body.sha, body.message])).toEqual([
		[`${STATES}/maine.json`, undefined, 'uncial-cms: save states maine']
	]);
	expect(JSON.parse(fromBase64(String(puts[0]!.body.content))).meta).toEqual({
		name: 'Maine',
		capital: 'Augusta'
	});

	await page.getByRole('link', { name: 'Back to States' }).click();
	await expect(slugs).toHaveText(['maine', 'ohio', 'texas']);
	await page.getByRole('button', { name: 'Delete texas' }).click();
	const dialog = page.getByRole('dialog', { name: 'Delete this record?' });
	await dialog.getByRole('button', { name: 'Delete' }).click();
	await expect(slugs).toHaveText(['maine', 'ohio']);
	expect(deletes.map(({ path }) => path)).toEqual([`${STATES}/texas.json`]);
});

test('the Global form and a Collection have no WCAG 2.1 A/AA violations at 390px', async ({
	page
}) => {
	const { commitElsewhere } = await interceptDemoGitHubWithStore(page, FILES);
	await seedDemoSession(page);
	await page.setViewportSize({ width: 390, height: 900 });

	await page.goto('/uncial/#/globals/footer');
	await expect(link(page, 2, 2).getByLabel('label')).toHaveValue('Map');
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
		.toBeLessThanOrEqual(390);
	expect((await scan(page)).violations).toEqual([]);

	await link(page, 2, 2).getByLabel('href').fill('map');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.locator('.uncial-field__error')).toHaveCount(1);
	expect((await scan(page)).violations).toEqual([]);

	await link(page, 2, 2).getByLabel('href').fill('/map/');
	commitElsewhere(FOOTER_SOURCE, JSON.stringify(FOOTER));
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('alert')).toBeVisible();
	expect((await scan(page)).violations).toEqual([]);

	await page.goto('/uncial/#/collections/states');
	await expect(page.getByRole('link', { name: 'texas' })).toBeVisible();
	expect((await scan(page)).violations).toEqual([]);
});
