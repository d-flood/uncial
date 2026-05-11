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
					"Uncial is a backend-agnostic, block-based WYSIWYG editor for Svelte, powered by Tiptap, designed to bridge the gap between authoring and rendering. For CMS implementers, Uncial's primary value is achieving true 1:1 visual parity with zero code duplication: you define a custom block once as a single Svelte component and reuse that exact component across both the editor interface and the final frontend presentation. Coupled with built-in schema validation, typed attribute normalization, and support for deeply nested block content, Uncial significantly reduces development overhead and ensures a highly predictable, seamless content creation experience."
				)
			)
			.toBeInTheDocument();
		await expect.element(page.getByText('Page structure')).not.toBeInTheDocument();

		await page.getByRole('tab', { name: 'Rendered' }).click();
		const rendered = page.getByRole('region', { name: 'Rendered' });
		await expect.element(rendered.getByText('Define a block once.')).toBeInTheDocument();
	});

	it('opens block attributes when an atomic block is selected in the editor', async () => {
		render(Page);
		const editor = page.getByRole('region', { name: 'Editor' });

		await editor.getByText('Define a block once.').click();
		await expect.element(page.getByText(/Edit\s+card/i)).toBeInTheDocument();

		await editor.getByText('This editor is the demo.').click();
		await expect.element(page.getByText(/Edit\s+callout/i)).toBeInTheDocument();
		await expect.element(page.getByText(/Configure\s+card/i)).not.toBeInTheDocument();
	});

	it('keeps top-level rich text as plain document nodes', async () => {
		render(Page);
		const editor = page.getByRole('region', { name: 'Editor' });

		await expect.element(page.getByText('Rich Text', { exact: true })).not.toBeInTheDocument();

		await editor
			.getByText(
				'Register blocks, create a schema, bind the editor to JSON, and render the same document anywhere.'
			)
			.click();

		await expect.element(page.getByText('Rich Text', { exact: true })).not.toBeInTheDocument();
	});

	it('edits code block language through the attributes panel', async () => {
		render(Page);
		const editor = page.getByRole('region', { name: 'Editor' });

		await editor.getByText('createBlockRegistry').click();
		await expect.element(page.getByText(/Edit\s+Code block/i)).toBeInTheDocument();

		await page.getByRole('combobox', { name: 'language' }).selectOptions('python');
		await page.getByRole('tab', { name: 'JSON' }).click();

		await expect.element(page.getByText('"language": "python"')).toBeInTheDocument();
	});
});
