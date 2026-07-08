import { expect, test } from '@playwright/test';
import {
	fromBase64,
	GETTING_STARTED_SOURCE,
	interceptDocsGitHub,
	seedDocsSession
} from './docs-helpers.js';

test('the editor metadata panel edits navGroup/navOrder and a save round-trips them', async ({
	page
}) => {
	const { puts } = await interceptDocsGitHub(page);
	await seedDocsSession(page);

	await page.goto('/getting-started/edit/');

	// The document must be loaded before the metadata panel reflects its meta.
	await expect(page.locator('uncial-editor .ProseMirror')).toContainText(
		'Your presentation layer is the editor'
	);

	// The metadata panel lives behind the "Edit document metadata" dropdown; the
	// controls render inside the editor's shadow root.
	const editor = page.locator('uncial-editor');
	await editor.getByLabel('Edit document metadata').click();

	// The schema's meta fields are forwarded through mountEditorPage, so navGroup
	// and navOrder render as editable fields (not just the pre-existing title).
	const navGroup = editor.getByLabel('navGroup', { exact: true });
	const navOrder = editor.getByLabel('navOrder', { exact: true });
	await expect(navGroup).toBeVisible();
	await expect(navOrder).toBeVisible();

	await navGroup.fill('Guides');
	await navOrder.fill('7');
	await editor.getByRole('button', { name: 'Save Metadata' }).click();

	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Committed to main');

	expect(puts).toHaveLength(1);
	expect(puts[0]!.path).toBe(GETTING_STARTED_SOURCE);
	const saved = JSON.parse(fromBase64(String(puts[0]!.body.content))) as {
		meta?: Record<string, unknown>;
	};
	expect(saved.meta).toMatchObject({ title: 'Getting started', navGroup: 'Guides', navOrder: 7 });
});
