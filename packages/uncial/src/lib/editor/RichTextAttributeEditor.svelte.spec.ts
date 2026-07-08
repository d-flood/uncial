import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RichTextAttributeEditor from './RichTextAttributeEditor.svelte';

const value = {
	type: 'doc',
	content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }]
};

describe('RichTextAttributeEditor', () => {
	it('renders toolbar buttons for the resolved features', async () => {
		render(RichTextAttributeEditor, {
			value,
			features: ['bold', 'italic', 'bulletList'],
			onChange: () => {}
		});

		await expect.element(page.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Italic' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Bullet list' })).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Strikethrough' }))
			.not.toBeInTheDocument();
	});

	it('updates toolbar active state after a transaction', async () => {
		render(RichTextAttributeEditor, {
			value,
			features: ['bold', 'italic'],
			onChange: () => {}
		});

		const boldButton = page.getByRole('button', { name: 'Bold' });
		await expect.element(boldButton).toHaveClass('uncial-btn--ghost');
		await expect.element(boldButton).not.toHaveClass('uncial-btn--active');

		await boldButton.click();

		await expect.element(boldButton).toHaveClass('uncial-btn--active');
		await expect.element(boldButton).not.toHaveClass('uncial-btn--ghost');

		await boldButton.click();

		await expect.element(boldButton).toHaveClass('uncial-btn--ghost');
		await expect.element(boldButton).not.toHaveClass('uncial-btn--active');
	});
});
