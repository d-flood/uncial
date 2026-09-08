import { expect, test } from '@playwright/test';
import { GETTING_STARTED_TEXT } from './dev-helpers.js';

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

test.use({ viewport: { width: 1440, height: 900 } });

test('the Editor variant has the Content page for a layout — parity of box and type', async ({
	page
}) => {
	await page.goto('/getting-started/');
	const article = page.locator('main article');
	await expect(article).toContainText(GETTING_STARTED_TEXT);
	const readerWidth = (await article.boundingBox())!.width;
	// The first paragraph of the rendered document, not the "On this page" label.
	const readerType = await paragraphType(page.locator('article .uncial-content p').first());

	await page.goto('/getting-started/edit/');
	const editorContent = page.locator('.uncial-cms-editor-page .uncial-content');
	await expect(editorContent).toContainText(GETTING_STARTED_TEXT);
	const editorWidth = (await editorContent.boundingBox())!.width;
	const editorType = await paragraphType(editorContent.locator('p').first());

	expect(editorWidth).toBe(readerWidth);
	expect(editorType).toEqual(readerType);
});
