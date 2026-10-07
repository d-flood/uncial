import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { seedDemoSession } from './demo-helpers.js';

const REPO = 'uncial-fixture/site';
const CHECKOUT = new URL('astro-site/', import.meta.url).pathname;

test('<uncial-dashboard> mounts in an Astro page and lists the fixture’s pages', async ({
	page
}) => {
	await seedDemoSession(page, REPO);
	const trees = `/repos/${REPO}/git/trees/`;
	const contents = `/repos/${REPO}/contents/`;
	await page.route('https://api.github.com/**', async (route) => {
		const { pathname } = new URL(route.request().url());
		if (pathname.startsWith(contents)) {
			const path = join(CHECKOUT, decodeURIComponent(pathname.slice(contents.length)));
			if (!existsSync(path)) {
				await route.fulfill({ status: 404, json: { message: 'Not Found' } });
				return;
			}
			const content = readFileSync(path);
			await route.fulfill({
				json: {
					content: content.toString('base64'),
					encoding: 'base64',
					sha: 'sha-original',
					size: content.length
				}
			});
			return;
		}
		if (!pathname.startsWith(trees)) {
			await route.fulfill({ status: 404, json: { message: 'Not Found' } });
			return;
		}
		const ref = decodeURIComponent(pathname.slice(trees.length));
		const dir = ref.slice(ref.indexOf(':') + 1);
		const tree = readdirSync(join(CHECKOUT, dir), { withFileTypes: true }).map((entry) => ({
			path: entry.name,
			type: entry.isDirectory() ? 'tree' : 'blob'
		}));
		await route.fulfill({ json: { tree, truncated: false } });
	});

	await page.goto('/uncial/');
	await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible();
	await expect(page.getByRole('status')).toContainText('Signed in as Octo Cat');
	for (const label of ['(site root)', '/about/', '/guide/start/']) {
		await expect(page.locator('li', { hasText: label })).toBeVisible();
	}
});
