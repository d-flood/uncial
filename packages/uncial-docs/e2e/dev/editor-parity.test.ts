import { expect, test, type Page } from '@playwright/test';
import {
	GETTING_STARTED_FILE,
	GETTING_STARTED_TEXT,
	readDoc,
	restoreDoc
} from './dev-helpers.js';

/** The typography a reader sees; the editor must resolve the same values. */
async function paragraphType(locator: import('@playwright/test').Locator) {
	return locator.evaluate((node) => {
		const style = getComputedStyle(node);
		return {
			fontFamily: style.fontFamily,
			fontSize: style.fontSize,
			lineHeight: style.lineHeight,
			color: style.color
		};
	});
}

/** The docs Page template's shell: sidebar, title and table of contents. */
async function shell(page: Page) {
	const links = (name: string) => page.getByLabel(name).getByRole('link').allTextContents();
	return {
		sidebar: await links('Docs navigation'),
		title: await page.locator('main h1').textContent(),
		toc: await links('On this page')
	};
}

test.use({ viewport: { width: 1440, height: 900 } });

test('the Editor variant draws the Content page template — parity of shell, box and type', async ({
	page
}) => {
	await page.goto('/getting-started/');
	const article = page.locator('main article');
	await expect(article).toContainText(GETTING_STARTED_TEXT);
	const readerWidth = (await article.boundingBox())!.width;
	// The first paragraph of the rendered document, not the "On this page" label.
	const readerType = await paragraphType(page.locator('article .uncial-content p').first());
	const readerShell = await shell(page);
	expect(readerShell.title).toBe('Getting started');
	expect(Math.min(readerShell.sidebar.length, readerShell.toc.length)).toBeGreaterThan(0);

	await page.goto('/getting-started/edit/');
	const editorContent = page.locator('.uncial-cms-editor-page .uncial-content');
	await expect(editorContent).toContainText(GETTING_STARTED_TEXT);
	const editorWidth = (await editorContent.boundingBox())!.width;
	const editorType = await paragraphType(editorContent.locator('p').first());

	expect(await shell(page)).toEqual(readerShell);
	expect(editorWidth).toBe(readerWidth);
	expect(editorType).toEqual(readerType);

	// The template's title is a Field component: edited in place, committed as metadata.
	const original = readDoc(GETTING_STARTED_FILE);
	try {
		await page.locator('main h1').getByRole('textbox').click();
		await page.keyboard.press('End');
		await page.keyboard.type(' again');
		await page.keyboard.press('Enter');
		await expect.poll(() => readDoc(GETTING_STARTED_FILE)).toContain('"Getting started again"');
		await page.getByLabel('Edit document metadata').click();
		await expect(page.getByLabel('title', { exact: true })).toHaveValue('Getting started again');
	} finally {
		restoreDoc(GETTING_STARTED_FILE, original);
	}
});

test('an unknown path is a 404', async ({ page }) => {
	expect((await page.goto('/no-such-page/'))!.status()).toBe(404);
});
