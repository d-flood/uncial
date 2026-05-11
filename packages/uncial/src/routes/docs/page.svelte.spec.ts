import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.md';

describe('/docs/+page.md', () => {
	it('shows the single-page library guide', async () => {
		render(Page);

		await expect
			.element(page.getByRole('heading', { name: 'Add Uncial to a Svelte 5 app' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('heading', { name: 'Define a custom block once' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('heading', { name: 'Edit and render the same JSON' }))
			.toBeInTheDocument();
		await expect.element(page.getByText('npm install uncial')).toBeInTheDocument();
		await expect.element(page.getByText('pnpm add uncial')).toBeInTheDocument();
		await expect.element(page.getByText('bun add uncial')).toBeInTheDocument();
		await expect
			.element(page.getByText("import PromoCard from './PromoCard.svelte';"))
			.toBeInTheDocument();
	});
});
