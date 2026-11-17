import { expect, test, type Page, type Route } from '@playwright/test';
import {
	DOCS_REPO,
	GETTING_STARTED_SOURCE,
	fromBase64,
	seedDocsSession,
	toBase64
} from './docs-helpers.js';
import { noisePng } from './noise-png.js';

// A Docs document whose only block is an Image with no src yet.
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

interface RecordedGitPost {
	endpoint: string; // e.g. 'blobs', 'trees', minus the Git Data API prefix
	body: Record<string, unknown>;
}

/**
 * Intercept api.github.com for the image tests: the page source serves
 * IMAGE_DOC and records saves; every other path 404s (so uploadAsset's
 * existence probe misses and falls through to a create). Contents API PUTs
 * and Git Data API POSTs are recorded so a test can assert the committed
 * asset path and the saved document's stored src.
 */
async function interceptImageGitHub(
	page: Page
): Promise<{ puts: RecordedPut[]; gitPosts: RecordedGitPost[] }> {
	const puts: RecordedPut[] = [];
	const gitPosts: RecordedGitPost[] = [];
	const contentsPrefix = '/repos/d-flood/uncial/contents/';
	const gitPrefix = '/repos/d-flood/uncial/git/';

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
					json: {
						content: toBase64(raw),
						encoding: 'base64',
						sha: 'sha-original',
						size: raw.length
					}
				});
				return;
			}
		}

		// A file over the Contents API cap commits as blob, tree, commit, then a
		// fast-forward of main.
		if (url.pathname.startsWith(gitPrefix)) {
			const endpoint = url.pathname.slice(gitPrefix.length);
			if (request.method() === 'POST') {
				gitPosts.push({ endpoint, body: request.postDataJSON() as Record<string, unknown> });
				await route.fulfill({ json: { sha: `git-${gitPosts.length}` } });
				return;
			}
			if (endpoint === 'ref/heads/main') {
				await route.fulfill({ json: { object: { sha: 'head-sha' } } });
				return;
			}
			if (endpoint === 'commits/head-sha') {
				await route.fulfill({ json: { tree: { sha: 'base-tree-sha' } } });
				return;
			}
			if (endpoint === 'refs/heads/main' && request.method() === 'PATCH') {
				await route.fulfill({ json: { object: { sha: `git-${gitPosts.length}` } } });
				return;
			}
		}

		// Unknown reads (e.g. the not-yet-committed asset) miss — uploadAsset treats
		// this as "create".
		await route.fulfill({ status: 404, json: { message: 'Not Found' } });
	});

	return { puts, gitPosts };
}

/**
 * Activate the Image block and upload `file` through its image field in the
 * attributes panel.
 */
async function uploadInPanel(
	page: Page,
	file: { name: string; mimeType: string; buffer: Buffer }
): Promise<void> {
	const editor = page.locator('.uncial-cms-editor-page');
	await editor.getByRole('button', { name: 'Image', exact: true }).click();
	const chooser = page.waitForEvent('filechooser');
	await editor.getByRole('button', { name: 'Upload', exact: true }).click();
	await (await chooser).setFiles(file);
}

/** The forge's cap, mirrored here rather than imported into the e2e bundle. */
const MAX_CONTENT_BYTES = 1024 * 1024;

test('uploading in the Image field commits the file and stores the served src, with a local preview', async ({
	page
}) => {
	const { puts } = await interceptImageGitHub(page);
	await seedDocsSession(page);

	await page.goto('/getting-started/edit/');

	const editor = page.locator('.uncial-cms-editor-page');
	await uploadInPanel(page, { name: 'diagram.png', mimeType: 'image/png', buffer: noisePng(8, 8) });

	// The canvas renders the session's local preview: the committed copy only
	// serves after the next redeploy.
	const img = editor.locator('figure img');
	await expect(img).toHaveAttribute('src', /^blob:/);

	// The bytes are committed to the content-addressed media path via uploadAsset.
	await expect
		.poll(
			() => puts.find((put) => put.path.startsWith('packages/uncial-docs/static/uploads/'))?.path
		)
		.toMatch(/^packages\/uncial-docs\/static\/uploads\/[0-9a-f]+\.png$/);

	// Saving the page persists the mapped, served src (base is '' in the e2e build).
	// Scope to the CMS status line by class: the image field's own "Uploading…"
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

test('an image over the Contents API cap commits unchanged through the Git Data API', async ({
	page
}) => {
	const { puts, gitPosts } = await interceptImageGitHub(page);
	await seedDocsSession(page);

	await page.goto('/getting-started/edit/');

	const editor = page.locator('.uncial-cms-editor-page');

	// Noise at 900×700 deflates to over the Contents API cap and under the image limit.
	const oversize = noisePng(900, 700);
	expect(oversize.byteLength).toBeGreaterThan(MAX_CONTENT_BYTES);
	await uploadInPanel(page, { name: 'huge.png', mimeType: 'image/png', buffer: oversize });

	await expect
		.poll(
			() =>
				(
					gitPosts.find((post) => post.endpoint === 'trees')?.body.tree as Array<{ path: string }>
				)?.[0]?.path
		)
		.toMatch(/^packages\/uncial-docs\/static\/uploads\/[0-9a-f]+\.png$/);
	const blob = gitPosts.find((post) => post.endpoint === 'blobs')!;
	expect(Buffer.from(String(blob.body.content), 'base64').equals(oversize)).toBe(true);
	expect(gitPosts.map((post) => post.endpoint)).toEqual(['blobs', 'trees', 'commits']);
	await expect(editor.getByText('Uploading…')).toHaveCount(0);
	await expect(editor.getByRole('alert')).toHaveCount(0);

	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.locator('.uncial-cms-status')).toContainText('Committed to main');

	const docPut = puts.find((put) => put.path === GETTING_STARTED_SOURCE);
	const saved = JSON.parse(fromBase64(String(docPut!.body.content))) as {
		content: Array<{ type: string; attrs?: Record<string, unknown> }>;
	};
	const imageNode = saved.content.find((node) => node.type === 'image');
	expect(String(imageNode?.attrs?.src)).toMatch(/^\/uploads\/[0-9a-f]+\.png$/);
});
