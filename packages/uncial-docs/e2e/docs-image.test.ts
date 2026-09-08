import { expect, test, type Page, type Route } from '@playwright/test';
import { DOCS_REPO, GETTING_STARTED_SOURCE, fromBase64, seedDocsSession, toBase64 } from './docs-helpers.js';
import { noisePng } from './noise-png.js';

// A Docs document whose only block is an Image with no src yet, so the editor
// renders the Image block's Upload affordance.
const IMAGE_DOC = {
	type: 'doc',
	version: 1,
	meta: { title: 'Getting started' },
	content: [{ type: 'image', attrs: { src: '', alt: 'Architecture diagram', caption: '' } }]
};

interface RecordedPut {
	path: string; // repo-root-relative, minus the contents API prefix
	body: Record<string, unknown>;
}

/**
 * Intercept api.github.com for the image tests: the page source serves
 * IMAGE_DOC and records saves; every other path 404s (so uploadAsset's
 * existence probe misses and falls through to a create PUT). All PUTs are
 * recorded, keyed by path, so a test can assert the committed asset path and
 * the saved document's stored src.
 */
async function interceptImageGitHub(page: Page): Promise<{ puts: RecordedPut[] }> {
	const puts: RecordedPut[] = [];
	const contentsPrefix = '/repos/d-flood/uncial/contents/';

	await page.route('https://api.github.com/**', async (route: Route) => {
		const request = route.request();
		const url = new URL(request.url());

		if (url.pathname === '/user') {
			await route.fulfill({ json: { login: 'octocat', id: 583231, name: 'Octo Cat' } });
			return;
		}

		if (url.pathname.startsWith(contentsPrefix)) {
			const path = url.pathname.slice(contentsPrefix.length);
			if (request.method() === 'PUT') {
				puts.push({ path, body: request.postDataJSON() as Record<string, unknown> });
				await route.fulfill({
					json: { content: { sha: `sha-${puts.length}` }, commit: { sha: '1234567deadbeef' } }
				});
				return;
			}
			if (request.method() === 'GET' && path === GETTING_STARTED_SOURCE) {
				const raw = JSON.stringify(IMAGE_DOC);
				await route.fulfill({
					json: { content: toBase64(raw), encoding: 'base64', sha: 'sha-original', size: raw.length }
				});
				return;
			}
		}

		// Unknown reads (e.g. the not-yet-committed asset) miss — uploadAsset treats
		// this as "create".
		await route.fulfill({ status: 404, json: { message: 'Not Found' } });
	});

	return { puts };
}

/** The forge's cap, mirrored here rather than imported into the e2e bundle. */
const MAX_CONTENT_BYTES = 1024 * 1024;

test('uploading in the Image block commits the file and stores the served src, with a local preview', async ({
	page
}) => {
	const { puts } = await interceptImageGitHub(page);
	await seedDocsSession(page);

	await page.goto('/getting-started/edit/');

	// The Image block's Upload input is visible because the document loaded with
	// an empty src.
	const editor = page.locator('.uncial-cms-editor-page');
	const fileInput = editor.locator('input[type="file"]');
	await expect(fileInput).toBeVisible();

	await fileInput.setInputFiles({
		name: 'diagram.png',
		mimeType: 'image/png',
		buffer: noisePng(8, 8)
	});

	// Immediate local preview: the <img> shows an object URL before the commit
	// lands (the committed copy only serves after the next redeploy).
	const img = editor.locator('figure img');
	await expect(img).toHaveAttribute('src', /^blob:/);

	// The bytes are committed to the content-addressed media path via uploadAsset.
	await expect
		.poll(() => puts.find((put) => put.path.startsWith('packages/uncial-docs/static/uploads/'))?.path)
		.toMatch(/^packages\/uncial-docs\/static\/uploads\/[0-9a-f]+\.png$/);

	// Saving the page persists the mapped, served src (base is '' in the e2e build).
	// Scope to the CMS status line by class: the Image block's own "Uploading…"
	// indicator is also role=status.
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.locator('.uncial-cms-status')).toContainText('Committed to main');

	const docPut = puts.find((put) => put.path === GETTING_STARTED_SOURCE);
	expect(docPut).toBeDefined();
	const saved = JSON.parse(fromBase64(String(docPut!.body.content))) as {
		content: Array<{ type: string; attrs?: Record<string, unknown> }>;
	};
	const imageNode = saved.content.find((node) => node.type === 'image');
	expect(String(imageNode?.attrs?.src)).toMatch(/^\/uploads\/[0-9a-f]+\.png$/);
});

test('an oversize image is downscaled and commits as WebP under the limit', async ({ page }) => {
	const { puts } = await interceptImageGitHub(page);
	await seedDocsSession(page);

	await page.goto('/getting-started/edit/');

	const editor = page.locator('.uncial-cms-editor-page');
	const fileInput = editor.locator('input[type="file"]');
	await expect(fileInput).toBeVisible();

	// Noise at 900×700 deflates to well over the Contents API cap, which the
	// upload used to reject outright; `fit` re-encodes it instead.
	const oversize = noisePng(900, 700);
	expect(oversize.byteLength).toBeGreaterThan(MAX_CONTENT_BYTES);
	await fileInput.setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: oversize });

	const assetPath = 'packages/uncial-docs/static/uploads/';
	await expect
		.poll(() => puts.find((put) => put.path.startsWith(assetPath))?.path)
		.toMatch(/^packages\/uncial-docs\/static\/uploads\/[0-9a-f]+\.webp$/);

	const assetPut = puts.find((put) => put.path.startsWith(assetPath))!;
	expect(Buffer.from(String(assetPut.body.content), 'base64').byteLength).toBeLessThanOrEqual(
		MAX_CONTENT_BYTES
	);
	await expect(editor.locator('.uncial-image-error')).toHaveCount(0);
});
