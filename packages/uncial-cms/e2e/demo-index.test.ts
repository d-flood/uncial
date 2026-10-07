import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
	ABOUT_DOC,
	ABOUT_SOURCE,
	CONTENT_DIR,
	DEMO_REPO,
	fromBase64,
	interceptDemoGitHubWithStore,
	seedDemoSession
} from './demo-helpers.js';

const AUTH_WORKER = 'https://uncial-cms-auth.dflood.workers.dev';

const INITIAL_FILES = {
	[`${CONTENT_DIR}/index.json`]: JSON.stringify(ABOUT_DOC),
	[ABOUT_SOURCE]: JSON.stringify(ABOUT_DOC)
};

const pagesAt = (paths: string[]) =>
	Object.fromEntries(
		paths.map((path) => [`${CONTENT_DIR}/${path}.json`, JSON.stringify(ABOUT_DOC)])
	);

async function relayPopupSignIn(page: Page): Promise<unknown[]> {
	const tokenRequests: unknown[] = [];
	await page.route(`${AUTH_WORKER}/token`, async (route) => {
		tokenRequests.push(route.request().postDataJSON());
		await route.fulfill({
			json: {
				token: 'ghs_e2e_renewed_token',
				expiresAt: Date.now() + 3_600_000,
				repo: DEMO_REPO,
				user: {
					login: 'octocat',
					name: 'Octo Cat',
					email: '583231+octocat@users.noreply.github.com'
				}
			}
		});
	});
	await page.addInitScript((origin) => {
		window.open = () => {
			setTimeout(() => {
				const data = { source: 'uncial-cms-auth', code: 'e2e-code', state: 'e2e-state' };
				window.dispatchEvent(new MessageEvent('message', { origin, data }));
			});
			return { closed: false } as Window;
		};
	}, AUTH_WORKER);
	return tokenRequests;
}

function autoAcceptDialogs(page: Page): void {
	page.on('dialog', (dialog) => void dialog.accept());
}

test('create → fallback edit → delete round-trip through the Dashboard', async ({ page }) => {
	const { puts, deletes } = await interceptDemoGitHubWithStore(page, { ...INITIAL_FILES });
	autoAcceptDialogs(page);
	await seedDemoSession(page);

	await page.goto('/uncial/');
	await expect(page.getByRole('status')).toContainText('Signed in as Octo Cat');

	// Create: validated path input seeds the document and opens the fallback editor.
	await page.getByLabel('New page path').fill('team/new-page');
	await page.getByRole('button', { name: 'Create page' }).click();

	await expect(page).toHaveURL(/#\/edit\/team\/new-page$/);
	const editor = page.locator('uncial-editor .ProseMirror');
	await expect(editor).toBeVisible();

	expect(puts).toHaveLength(1);
	const createPut = puts[0]!;
	expect(createPut.path).toBe(`${CONTENT_DIR}/team/new-page.json`);
	expect(createPut.body.sha).toBeUndefined(); // create mode: no sha
	expect(createPut.body.message).toBe('uncial-cms: create team/new-page');
	const seeded = JSON.parse(fromBase64(String(createPut.body.content)));
	expect(seeded.type).toBe('doc');

	// The just-created page is editable before any deploy completes.
	await editor.click();
	await page.keyboard.type('Fresh page body');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status').last()).toContainText('Committed to main');

	expect(puts).toHaveLength(2);
	const editPut = puts[1]!;
	expect(editPut.path).toBe(`${CONTENT_DIR}/team/new-page.json`);
	expect(editPut.body.sha).toBe('sha-1'); // edit mode: sha from the create commit
	expect(editPut.body.message).toBe('uncial-cms: edit team/new-page');

	// Back to the list; the new page shows up and can be deleted.
	await page.getByRole('link', { name: 'Back to pages' }).click();
	await expect(page.getByRole('heading', { name: 'Pages' })).toBeFocused();
	const row = page.locator('li', { hasText: '/team/new-page/' });
	await expect(row).toBeVisible();
	await row.getByRole('button', { name: 'Delete' }).click();

	const confirm = page.getByRole('dialog', { name: 'Delete this page?' });
	await expect(confirm).toContainText(`${CONTENT_DIR}/team/new-page.json`);
	await confirm.getByRole('button', { name: 'Delete' }).click();

	await expect
		.poll(() => deletes.length, { message: 'DELETE commit recorded' })
		.toBe(1);
	expect(deletes[0]!.path).toBe(`${CONTENT_DIR}/team/new-page.json`);
	expect(deletes[0]!.body.message).toBe('uncial-cms: delete team/new-page');
	expect(deletes[0]!.body.sha).toBe('sha-2');
	await expect(page.locator('li', { hasText: '/team/new-page/' })).toHaveCount(0);
});

test('create on an existing path is rejected before any commit', async ({ page }) => {
	const { puts } = await interceptDemoGitHubWithStore(page, { ...INITIAL_FILES });
	autoAcceptDialogs(page);
	await seedDemoSession(page);

	await page.goto('/uncial/');
	await expect(page.getByRole('status')).toContainText('Signed in as Octo Cat');

	await page.getByLabel('New page path').fill('about');
	await page.getByRole('button', { name: 'Create page' }).click();
	await expect(page.getByRole('alert')).toContainText('already exists');

	await page.getByLabel('New page path').fill('Not A Valid Path');
	await page.getByRole('button', { name: 'Create page' }).click();
	await expect(page.getByRole('alert')).toContainText('lowercase');

	expect(puts).toHaveLength(0);
});

test('search narrows the Pages list and a folder filter applies, both kept in the hash', async ({
	page
}) => {
	await interceptDemoGitHubWithStore(page, {
		...INITIAL_FILES,
		...pagesAt(['team/alice', 'team/bob', 'blog/hello'])
	});
	await seedDemoSession(page);

	await page.goto('/uncial/');
	const summary = page.getByText(/^Showing/);
	const row = (label: string) => page.locator('li', { hasText: label });
	await expect(summary).toHaveText('Showing 1–5 of 5 pages');

	const search = page.getByLabel('Search');
	await search.fill('ALI');
	await expect(summary).toHaveText('Showing 1–1 of 1 page');
	await expect(row('/team/alice/')).toBeVisible();
	await expect(row('/about/')).toHaveCount(0);
	await expect(search).toBeFocused();
	await expect(page).toHaveURL(/#\/pages\?q=ALI$/);

	await search.fill('');
	const folder = page.getByLabel('Folder');
	await expect(folder.getByRole('option')).toHaveText(['All folders', '/blog/', '/team/']);
	await folder.selectOption('team');
	await expect(summary).toHaveText('Showing 1–2 of 2 pages');
	await expect(row('/team/bob/')).toBeVisible();
	await expect(row('/blog/hello/')).toHaveCount(0);
	await expect(page).toHaveURL(/#\/pages\?folder=team$/);

	await page.reload();
	await expect(summary).toHaveText('Showing 1–2 of 2 pages');
	await expect(page.getByLabel('Folder')).toHaveValue('team');
});

test('the old fallback link #/about/ opens #/edit/about and commits to the same source as /about/edit/', async ({
	page
}) => {
	const { puts } = await interceptDemoGitHubWithStore(page, { ...INITIAL_FILES });
	autoAcceptDialogs(page);
	await seedDemoSession(page);

	await page.goto('/uncial/#/about/');
	await expect(page).toHaveURL(/#\/edit\/about$/);
	const editor = page.locator('uncial-editor .ProseMirror');
	await expect(editor).toContainText('Hello from the demo repo');

	await editor.click();
	await page.keyboard.press('End');
	await page.keyboard.type(' — via fallback');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status').last()).toContainText('Committed to main');

	expect(puts).toHaveLength(1);
	expect(puts[0]!.path).toBe(ABOUT_SOURCE); // identical PUT path to /about/edit/
	expect(puts[0]!.body.message).toBe('uncial-cms: edit about');
});

test('a blocked sign-in popup can be retried from the Sign in button', async ({ page }) => {
	await interceptDemoGitHubWithStore(page, { ...INITIAL_FILES });
	// Browsers block a popup opened outside a click, which is how the index's
	// first sign-in attempt runs.
	await page.addInitScript(() => {
		window.open = () => null;
	});

	await page.goto('/uncial/');
	await expect(page.getByRole('heading', { name: 'Signed out' })).toBeVisible();
	await expect(page.getByRole('status')).toContainText('popup was blocked');
	const signIn = page.getByRole('button', { name: 'Sign in' });
	await expect(signIn).toBeVisible();

	await page.evaluate((repo) => {
		sessionStorage.setItem(
			`uncial-cms:session:${repo}`,
			JSON.stringify({
				token: 'ghs_e2e_installation_token',
				expiresAt: null,
				repo,
				user: {
					login: 'octocat',
					name: 'Octo Cat',
					email: '583231+octocat@users.noreply.github.com'
				}
			})
		);
	}, DEMO_REPO);
	await signIn.click();

	await expect(page.getByRole('status')).toContainText('Signed in as Octo Cat');
	await expect(signIn).toBeHidden();
	await expect(page.locator('li', { hasText: '/about/' })).toBeVisible();
});

test('sign-out clears the session, and signing in again restores the Dashboard', async ({
	page
}) => {
	await interceptDemoGitHubWithStore(page, { ...INITIAL_FILES });
	await seedDemoSession(page);
	const tokenRequests = await relayPopupSignIn(page);

	await page.goto('/uncial/');
	await expect(page.getByRole('status')).toContainText('Signed in as Octo Cat');
	await page.getByRole('button', { name: 'Sign out' }).click();

	await expect(page.getByRole('heading', { name: 'Signed out' })).toBeFocused();
	await expect(page.getByRole('status')).toHaveText('You signed out.');
	await expect(page.locator('li', { hasText: '/about/' })).toHaveCount(0);
	await expect(page.getByRole('navigation', { name: 'Dashboard' })).toHaveCount(0);
	expect(
		await page.evaluate((repo) => sessionStorage.getItem(`uncial-cms:session:${repo}`), DEMO_REPO)
	).toBeNull();

	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByRole('heading', { name: 'Pages' })).toBeFocused();
	await expect(page.getByRole('status')).toContainText('Signed in as Octo Cat');
	await expect(page.locator('li', { hasText: '/about/' })).toBeVisible();
	expect(tokenRequests).toHaveLength(1);
});

test('a slotted App section shows host markup at #/app/<id>; a linked one leaves for the host route', async ({
	page
}) => {
	await interceptDemoGitHubWithStore(page, { ...INITIAL_FILES });
	await seedDemoSession(page);

	await page.goto('/uncial/');
	const nav = page.getByRole('navigation', { name: 'Dashboard' });
	const redirects = nav.getByRole('link', { name: 'Redirects' });
	const slotted = page.getByText('Redirects the host site serves:');
	await expect(page.locator('li', { hasText: '/about/' })).toBeVisible();
	await expect(slotted).toBeHidden();

	await redirects.click();
	await expect(page).toHaveURL(/#\/app\/redirects$/);
	await expect(page.getByRole('heading', { name: 'Redirects' })).toBeFocused();
	await expect(redirects).toHaveAttribute('aria-current', 'page');
	await expect(nav.getByRole('link', { name: 'Pages' })).not.toHaveAttribute('aria-current');
	await expect(slotted).toBeVisible();
	const scan = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(scan.violations).toEqual([]);

	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/uncial/#/pages');
	const menu = page.getByRole('button', { name: 'Menu' });
	await menu.click();
	await redirects.click();
	await expect(menu).toHaveAttribute('aria-expanded', 'false');
	await expect(slotted).toBeVisible();

	await page.setViewportSize({ width: 1280, height: 900 });
	await nav.getByRole('link', { name: 'About page' }).click();
	await expect(page).toHaveURL(/\/about\/$/);
	await expect(page.locator('uncial-dashboard')).toHaveCount(0);
});

for (const width of [390, 1280]) {
	test(`axe reports no WCAG 2.1 A/AA violations at ${width}px`, async ({ page }) => {
		const team = Array.from({ length: 55 }, (_, n) => `team/member-${n}`);
		await interceptDemoGitHubWithStore(page, { ...INITIAL_FILES, ...pagesAt(team) });
		await seedDemoSession(page);
		await page.setViewportSize({ width, height: 900 });

		await page.goto('/uncial/#/pages');
		await expect(page.locator('li', { hasText: '/about/' })).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Pagination' })).toBeVisible();

		const scan = () =>
			new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
		expect((await scan()).violations).toEqual([]);

		await page.getByRole('button', { name: 'Sign out' }).click();
		await expect(page.getByRole('heading', { name: 'Signed out' })).toBeVisible();
		expect((await scan()).violations).toEqual([]);
	});
}

test('on a phone the nav is a menu that Escape closes', async ({ page }) => {
	await interceptDemoGitHubWithStore(page, { ...INITIAL_FILES });
	await seedDemoSession(page);
	await page.setViewportSize({ width: 390, height: 844 });

	await page.goto('/uncial/');
	const menu = page.getByRole('button', { name: 'Menu' });
	const nav = page.getByRole('navigation', { name: 'Dashboard' });
	await expect(menu).toHaveAttribute('aria-expanded', 'false');
	await expect(nav).toBeHidden();

	await menu.click();
	await expect(menu).toHaveAttribute('aria-expanded', 'true');
	await expect(nav.getByRole('link', { name: 'Pages' })).toHaveAttribute('aria-current', 'page');

	await nav.getByRole('link', { name: 'Media' }).focus();
	await page.keyboard.press('Escape');
	await expect(menu).toHaveAttribute('aria-expanded', 'false');
	await expect(nav).toBeHidden();
	await expect(menu).toBeFocused();

	await menu.click();
	await nav.getByRole('link', { name: 'Media' }).click();
	await expect(page).toHaveURL(/#\/media$/);
	await expect(page.getByRole('heading', { name: 'Media' })).toBeFocused();
	await expect(menu).toHaveAttribute('aria-expanded', 'false');

	await page.setViewportSize({ width: 1280, height: 900 });
	await expect(menu).toBeHidden();
	await expect(nav).toBeVisible();
});
