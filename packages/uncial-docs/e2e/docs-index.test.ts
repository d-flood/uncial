import { expect, test, type Page } from '@playwright/test';
import {
	DOCS_CONTENT_DIR,
	GETTING_STARTED_DOC,
	GETTING_STARTED_SOURCE,
	GETTING_STARTED_TEXT,
	fromBase64,
	interceptDocsGitHub,
	interceptDocsGitHubWithStore,
	seedDocsSession
} from './docs-helpers.js';

const INITIAL_FILES = {
	[GETTING_STARTED_SOURCE]: JSON.stringify(GETTING_STARTED_DOC)
};

function autoAcceptDialogs(page: Page): void {
	// Sign-in is seeded (popup default, no prompt); the only dialogs the index
	// raises are confirms: delete and the unsaved-changes guard.
	page.on('dialog', (dialog) => void dialog.accept());
}

test('create a Docs page → set nav meta → it appears in the index, then delete round-trips', async ({
	page
}) => {
	const { puts, deletes } = await interceptDocsGitHubWithStore(page, { ...INITIAL_FILES });
	autoAcceptDialogs(page);
	await seedDocsSession(page);

	await page.goto('/uncial/');
	await expect(page.getByRole('status')).toContainText('as octocat');

	// Create: a validated path seeds a normalized doc and opens the fallback editor.
	await page.getByLabel('New page path').fill('guides/new-topic');
	await page.getByRole('button', { name: 'Create page' }).click();

	await expect(page).toHaveURL(/#\/guides\/new-topic\/$/);
	const editor = page.locator('uncial-editor');
	await expect(editor.locator('.ProseMirror')).toBeVisible();

	const newSource = `${DOCS_CONTENT_DIR}/guides/new-topic.json`;
	expect(puts.filter((put) => put.path === newSource)).toHaveLength(1); // the create commit

	// Set the sidebar meta the way a maintainer would: navGroup/navOrder render in
	// the metadata panel because mountIndexPage forwards the schema's metaFields.
	await editor.getByLabel('Edit document metadata').click();
	const navGroup = editor.getByLabel('navGroup', { exact: true });
	const navOrder = editor.getByLabel('navOrder', { exact: true });
	await expect(navGroup).toBeVisible();
	await navGroup.fill('Guides');
	await navOrder.fill('5');
	await editor.getByRole('button', { name: 'Save Metadata' }).click();

	// Author a line of body, then save — the commit carries the nav meta.
	await editor.locator('.ProseMirror').click();
	await page.keyboard.type('A freshly authored topic.');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	// Two status regions exist on the fallback editor (the "Editing … as octocat"
	// chrome line and the save/deploy status); assert on the commit text directly.
	await expect(page.getByText('Committed to main')).toBeVisible();

	const savedPut = puts.filter((put) => put.path === newSource).at(-1)!;
	const saved = JSON.parse(fromBase64(String(savedPut.body.content))) as {
		meta?: Record<string, unknown>;
	};
	expect(saved.meta).toMatchObject({ navGroup: 'Guides', navOrder: 5 });

	// Back to the index: the new page shows in the live listing (the nav's source).
	await page.getByRole('link', { name: '← Back to index' }).click();
	const row = page.locator('li', { hasText: '/guides/new-topic/' });
	await expect(row).toBeVisible();

	// Delete round-trips: a confirmed delete commits a removal and drops the row.
	await row.getByRole('button', { name: 'Delete' }).click();
	await expect.poll(() => deletes.length, { message: 'DELETE commit recorded' }).toBe(1);
	expect(deletes[0]!.path).toBe(newSource);
	expect(deletes[0]!.body.message).toBe('uncial-cms: delete guides/new-topic');
	await expect(page.locator('li', { hasText: '/guides/new-topic/' })).toHaveCount(0);
});

test('a concurrent-edit 409 surfaces the conflict banner without losing the edit', async ({
	page
}) => {
	await interceptDocsGitHub(page, { conflictOnPut: true });
	await seedDocsSession(page);

	await page.goto('/getting-started/edit/');

	const editor = page.locator('uncial-editor .ProseMirror');
	await expect(editor).toContainText(GETTING_STARTED_TEXT);

	await editor.click();
	await page.keyboard.press('End');
	await page.keyboard.type(' — conflicting edit');
	await expect(editor).toContainText('conflicting edit');

	await page.getByRole('button', { name: 'Save', exact: true }).click();

	// The 409 opens the conflict banner instead of silently overwriting main.
	const banner = page.getByRole('alert');
	await expect(banner).toContainText('changed on main');

	// The in-progress edit is preserved: downloading and dismissing keeps it.
	await banner.getByRole('button', { name: 'Download my version' }).click();
	await banner.getByRole('button', { name: 'Dismiss' }).click();
	await expect(banner).toBeHidden();
	await expect(editor).toContainText('conflicting edit');
});
