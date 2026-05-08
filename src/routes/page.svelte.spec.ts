import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('/+page.svelte', () => {
	it('shows authoring and preview surfaces bound to the same document', async () => {
		render(Page);
		const editor = page.getByRole('region', { name: 'Editor' });

		await expect.element(editor.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
		await expect.element(editor.getByText('Insert block', { exact: true })).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Block Attributes' }))
			.not.toBeInTheDocument();
		await expect
			.element(
				editor.getByText(
					'Plain rich text now lives directly in the document beside custom container blocks.'
				)
			)
			.toBeInTheDocument();
		await expect.element(page.getByText('Page structure')).not.toBeInTheDocument();

		await page.getByRole('tab', { name: 'Rendered' }).click();
		const rendered = page.getByRole('region', { name: 'Rendered' });
		await expect.element(rendered.getByText('Launch Checklist')).toBeInTheDocument();
	});

	it('opens block attributes when an atomic block is selected in the editor', async () => {
		render(Page);
		const editor = page.getByRole('region', { name: 'Editor' });

		await editor.getByText('Launch Checklist').click();
		await expect.element(page.getByText(/Edit\s+card/i)).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Update Block' })).toBeInTheDocument();

		await editor.getByText('Schema-backed authoring').click();
		await expect.element(page.getByText(/Edit\s+callout/i)).toBeInTheDocument();
		await expect.element(page.getByText(/Configure\s+card/i)).not.toBeInTheDocument();
	});

	it('keeps top-level rich text as plain document nodes', async () => {
		render(Page);
		const editor = page.getByRole('region', { name: 'Editor' });

		await expect.element(page.getByText('Rich Text', { exact: true })).not.toBeInTheDocument();

		await editor
			.getByText('Edit this document and use the toolbar to insert or configure blocks.')
			.click();

		await expect.element(page.getByText('Rich Text', { exact: true })).not.toBeInTheDocument();
	});
});
