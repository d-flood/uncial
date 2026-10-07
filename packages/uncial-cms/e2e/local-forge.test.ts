import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * The Dashboard on the local forge: the local-only fixture site in `vite dev`,
 * editing a fresh copy of its checkout through the forge's dev API. The tests
 * share that copy, so each seeds what it reads through the same API and keeps
 * to its own folder.
 */

const FILES_API = '/__uncial-cms/local/files';
const DIRS_API = '/__uncial-cms/local/dirs';
const MEDIA_DIR = 'static/uploads';
const PIXEL = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
	'base64'
);
const FOLIO = `${'f'.repeat(32)}.png`;
const PLATE = `${'b'.repeat(32)}.png`;

const doc = (title: string, ...blocks: unknown[]) =>
	JSON.stringify({
		type: 'doc',
		version: 1,
		meta: { title },
		content: [{ type: 'paragraph', content: [{ type: 'text', text: title }] }, ...blocks]
	});

const TEAM = Object.fromEntries(
	Array.from({ length: 55 }, (_, n) => [`content/team/member-${n}.json`, doc(`Member ${n}`)])
);

const MEDIA = {
	[`${MEDIA_DIR}/${FOLIO}`]: PIXEL,
	[`${MEDIA_DIR}/${PLATE}`]: PIXEL,
	'content/media/folio.json': doc('Folio', {
		type: 'image',
		attrs: { src: `/uploads/${FOLIO}`, alt: 'Folio' }
	})
};

const FOOTER_SOURCE = 'content/_globals/footer.json';
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

async function seed(request: APIRequestContext, files: Record<string, string | Buffer>) {
	for (const [path, content] of Object.entries(files)) {
		const response = await request.put(`${FILES_API}/${path}`, {
			data:
				typeof content === 'string'
					? { content }
					: { content: content.toString('base64'), encoding: 'base64' }
		});
		expect(response.ok(), `seed ${path}`).toBe(true);
	}
}

async function readCheckout(request: APIRequestContext, path: string): Promise<string | null> {
	const response = await request.post(`${FILES_API}/${path}`, { data: {} });
	return response.ok() ? ((await response.json()) as { content: string }).content : null;
}

async function listCheckout(request: APIRequestContext, dir: string): Promise<string[]> {
	const response = await request.post(`${DIRS_API}/${dir}`, { data: {} });
	return ((await response.json()) as { entries: Array<{ path: string }> }).entries.map(
		(entry) => entry.path
	);
}

const row = (page: Page, label: string) => page.locator('li', { hasText: label });
const card = (page: Page, filename: string) =>
	page.getByRole('listitem').filter({ hasText: filename });
const column = (page: Page, n: number) =>
	page.locator('.uncial-list-item').filter({ has: page.getByText(`column ${n}`, { exact: true }) });
const link = (page: Page, inColumn: number, n: number) =>
	column(page, inColumn)
		.locator('.uncial-list-item')
		.filter({ has: page.getByText(`link ${n}`, { exact: true }) });
const scan = (page: Page) =>
	new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

test('signed in as the local editor, Pages searches, filters by folder and pages through results', async ({
	page,
	request
}) => {
	await seed(request, TEAM);

	await page.goto('/uncial/');
	await expect(page.getByRole('status')).toContainText('Signed in as Local editor');
	await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
	await expect(row(page, '/about/')).toBeVisible();

	const summary = page.getByText(/^Showing/);
	await page.getByLabel('Folder').selectOption('team');
	await expect(summary).toHaveText('Showing 1–50 of 55 pages');
	await expect(row(page, '/about/')).toHaveCount(0);
	await expect(page).toHaveURL(/#\/pages\?folder=team$/);

	const pager = page.getByRole('navigation', { name: 'Pagination' });
	await expect(pager).toContainText('Page 1 of 2');
	await pager.getByRole('button', { name: 'Next page' }).click();
	await expect(summary).toHaveText('Showing 51–55 of 55 pages');
	await expect(pager).toContainText('Page 2 of 2');
	await expect(page).toHaveURL(/#\/pages\?folder=team&page=2$/);

	const search = page.getByLabel('Search');
	await search.fill('MEMBER 54');
	await expect(summary).toHaveText('Showing 1–1 of 1 page');
	await expect(row(page, '/team/member-54/')).toBeVisible();
	await expect(pager).toHaveCount(0);
	await expect(search).toBeFocused();

	await page.reload();
	await expect(summary).toHaveText('Showing 1–1 of 1 page');
	await expect(page.getByLabel('Folder')).toHaveValue('team');
});

test('create → fallback edit → delete writes and removes the file in the checkout', async ({
	page,
	request
}) => {
	const source = 'content/scratch/new-page.json';

	await page.goto('/uncial/');
	await expect(row(page, '/about/')).toBeVisible();

	await page.getByLabel('New page path').fill('about');
	await page.getByRole('button', { name: 'Create page' }).click();
	await expect(page.getByRole('alert')).toContainText('already exists');

	await page.getByLabel('New page path').fill('scratch/new-page');
	await page.getByRole('button', { name: 'Create page' }).click();
	await expect(page).toHaveURL(/#\/edit\/scratch\/new-page$/);
	const editor = page.locator('uncial-editor .ProseMirror');
	await expect(editor).toBeVisible();
	expect(JSON.parse((await readCheckout(request, source))!).type).toBe('doc');

	await editor.click();
	await page.keyboard.type('Fresh page body');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status').last()).toContainText('Committed to the local checkout');
	expect(await readCheckout(request, source)).toContain('Fresh page body');

	await page.getByRole('link', { name: 'Back to pages' }).click();
	await expect(page.getByRole('heading', { name: 'Pages' })).toBeFocused();
	await row(page, '/scratch/new-page/').getByRole('button', { name: 'Delete' }).click();
	const confirm = page.getByRole('dialog', { name: 'Delete this page?' });
	await expect(confirm).toContainText(`Delete ${source} from the local checkout?`);
	await confirm.getByRole('button', { name: 'Delete' }).click();

	await expect(row(page, '/scratch/new-page/')).toHaveCount(0);
	expect(await readCheckout(request, source)).toBeNull();
});

test('an upload appears in the grid, and an unused file deletes after a plain confirmation', async ({
	page,
	request
}) => {
	await seed(request, MEDIA);
	const before = await listCheckout(request, MEDIA_DIR);

	await page.goto('/uncial/#/media');
	await expect(page.getByRole('heading', { name: 'Media' })).toBeVisible();
	await expect(card(page, FOLIO)).toBeVisible();

	await page
		.locator('input[type=file]')
		.setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: PIXEL });

	await expect
		.poll(async () => (await listCheckout(request, MEDIA_DIR)).length, { message: 'upload written' })
		.toBe(before.length + 1);
	const uploaded = (await listCheckout(request, MEDIA_DIR)).find((path) => !before.includes(path))!;
	expect(uploaded).toMatch(new RegExp(`^${MEDIA_DIR}/[0-9a-f]{32}\\.png$`));
	const filename = uploaded.slice(MEDIA_DIR.length + 1);
	await expect(card(page, filename).getByRole('link', { name: `Open ${filename}` })).toHaveAttribute(
		'href',
		`/uploads/${filename}`
	);
	await expect
		.poll(() => card(page, filename).locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
		.toBeGreaterThan(0);

	await card(page, filename).getByRole('button', { name: `Delete ${filename}` }).click();
	const confirm = page.getByRole('dialog', { name: 'Delete this file?' });
	await expect(confirm).toContainText(`Delete ${filename} from the local checkout?`);
	await confirm.getByRole('button', { name: 'Delete' }).click();

	await expect(card(page, filename)).toHaveCount(0);
	expect(await readCheckout(request, uploaded)).toBeNull();
});

test('deleting a file a page uses warns with that page, and Escape keeps it', async ({
	page,
	request
}) => {
	await seed(request, MEDIA);

	await page.goto('/uncial/#/media');
	const remove = card(page, FOLIO).getByRole('button', { name: `Delete ${FOLIO}` });
	await remove.click();

	const warning = page.getByRole('dialog', { name: 'This file is in use' });
	await expect(warning.getByRole('listitem')).toHaveText(['/media/folio/']);
	await expect(warning.getByRole('button', { name: 'Cancel' })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(warning).toHaveCount(0);
	await expect(remove).toBeFocused();
	expect(await listCheckout(request, MEDIA_DIR)).toContain(`${MEDIA_DIR}/${FOLIO}`);

	await page.keyboard.press('Enter');
	await warning.getByRole('button', { name: 'Delete anyway' }).click();
	await expect(card(page, FOLIO)).toHaveCount(0);
	expect(await listCheckout(request, MEDIA_DIR)).not.toContain(`${MEDIA_DIR}/${FOLIO}`);
});

test('a Global edit is refused while a nested link is invalid, then saves to the checkout', async ({
	page,
	request
}) => {
	await seed(request, { [FOOTER_SOURCE]: JSON.stringify(FOOTER) });
	const status = page.getByRole('status').last();

	await page.goto('/uncial/#/globals');
	const entry = page.getByRole('listitem').filter({ hasText: 'footer' });
	await expect(entry).toContainText('Site footer');
	await entry.getByRole('link', { name: 'footer' }).click();
	await expect(page).toHaveURL(/#\/globals\/footer$/);
	await expect(page.getByRole('heading', { name: 'Site footer' })).toBeFocused();

	const map = link(page, 2, 2);
	await expect(map.getByLabel('label')).toHaveValue('Map');
	await map.getByLabel('href').fill('map');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(status).toHaveText('Not saved: 1 field needs fixing.');
	await expect(map.getByText('Metadata field "columns.1.links.1.href" is invalid')).toBeVisible();
	expect(JSON.parse((await readCheckout(request, FOOTER_SOURCE))!)).toEqual(FOOTER);

	await map.getByLabel('href').fill('/map/');
	await expect(page.locator('.uncial-field__error')).toHaveCount(0);
	await map.getByLabel('label').fill('Directions');
	await column(page, 2).getByRole('button', { name: 'Add link' }).click();
	await link(page, 2, 3).getByLabel('label').fill('Parking');
	await link(page, 2, 3).getByLabel('href').fill('/parking/');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(status).toContainText('Committed to the local checkout');

	const saved = JSON.parse((await readCheckout(request, FOOTER_SOURCE))!);
	expect(saved.content).toEqual([]);
	expect(saved.meta.columns[1]).toEqual({
		heading: 'Visit',
		links: [
			{ label: 'Hours', href: '/hours/' },
			{ label: 'Directions', href: '/map/' },
			{ label: 'Parking', href: '/parking/' }
		]
	});

	await page.reload();
	await expect(link(page, 2, 3).getByLabel('label')).toHaveValue('Parking');
});

test('the slotted App section shows host markup at #/app/redirects', async ({ page }) => {
	await page.goto('/uncial/');
	const nav = page.getByRole('navigation', { name: 'Dashboard' });
	const redirects = nav.getByRole('link', { name: 'Redirects' });
	const slotted = page.getByText('Redirects the host site serves:');
	await expect(row(page, '/about/')).toBeVisible();
	await expect(slotted).toBeHidden();

	await redirects.click();
	await expect(page).toHaveURL(/#\/app\/redirects$/);
	await expect(page.getByRole('heading', { name: 'Redirects' })).toBeFocused();
	await expect(redirects).toHaveAttribute('aria-current', 'page');
	await expect(slotted).toBeVisible();
});

for (const width of [390, 1280]) {
	test(`axe reports no WCAG 2.1 A/AA violations at ${width}px`, async ({ page, request }) => {
		await seed(request, { ...TEAM, ...MEDIA, [FOOTER_SOURCE]: JSON.stringify(FOOTER) });
		await page.setViewportSize({ width, height: 900 });

		await page.goto('/uncial/#/pages');
		await expect(row(page, '/about/')).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Pagination' })).toBeVisible();
		expect((await scan(page)).violations).toEqual([]);

		await page.goto('/uncial/#/media');
		await expect(card(page, PLATE)).toBeVisible();
		expect((await scan(page)).violations).toEqual([]);
		await card(page, FOLIO).getByRole('button', { name: `Delete ${FOLIO}` }).click();
		await expect(page.getByRole('dialog', { name: 'This file is in use' })).toBeVisible();
		expect((await scan(page)).violations).toEqual([]);
		await page.keyboard.press('Escape');

		await page.goto('/uncial/#/globals/footer');
		await expect(link(page, 2, 2).getByLabel('label')).toHaveValue('Map');
		expect((await scan(page)).violations).toEqual([]);
		await link(page, 2, 2).getByLabel('href').fill('map');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.locator('.uncial-field__error')).toHaveCount(1);
		expect((await scan(page)).violations).toEqual([]);

		await page.goto('/uncial/#/app/redirects');
		await expect(page.getByText('Redirects the host site serves:')).toBeVisible();
		expect((await scan(page)).violations).toEqual([]);
	});
}
