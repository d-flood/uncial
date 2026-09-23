import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { noisePng } from '../noise-png.js';
import { GETTING_STARTED_FILE, readDoc, restoreDoc } from './dev-helpers.js';

// `mediaDir` is repo-root-relative, so this is where the local forge has to land
// an upload for the built site to serve it. Playwright runs from the package
// root, two levels below the repository root.
const MEDIA_DIR = join('..', '..', 'packages/uncial-docs/static/uploads');

function uploads(): string[] {
	return readdirSync(MEDIA_DIR);
}

test('an upload under the local forge commits to mediaDir and its served URL resolves', async ({
	page,
	request,
	baseURL
}) => {
	const original = readDoc(GETTING_STARTED_FILE);
	const document = JSON.parse(original) as {
		content: Array<{ type: string; attrs?: Record<string, unknown> }>;
	};
	const image = document.content.find((node) => node.type === 'image');
	if (!image?.attrs) throw new Error('getting-started.json must contain an Image block.');
	image.attrs.src = '';
	const before = new Set(uploads());
	let committed: string | undefined;

	try {
		restoreDoc(GETTING_STARTED_FILE, JSON.stringify(document, null, '\t'));
		await page.goto('/getting-started/edit/');

		const editor = page.locator('.uncial-cms-editor-page');
		await editor.getByRole('button', { name: 'Image', exact: true }).click();
		const chooser = page.waitForEvent('filechooser');
		await editor.getByRole('button', { name: 'Upload', exact: true }).click();
		await (await chooser).setFiles({
			name: 'diagram.png',
			mimeType: 'image/png',
			buffer: noisePng(8, 8)
		});

		await expect(editor.locator('.ProseMirror figure.uncial-image img')).toHaveAttribute(
			'src',
			/^blob:/
		);
		await expect
			.poll(() => uploads().find((name) => !before.has(name)), {
				message: 'the upload lands under mediaDir, at its repository path',
				timeout: 15_000
			})
			.toMatch(/^[0-9a-f]+\.png$/);
		committed = uploads().find((name) => !before.has(name));

		// The URL `servedUrl` maps that committed path to, served by the dev server
		// from the static directory the media directory sits under.
		const served = await request.get(new URL(`/uploads/${committed}`, baseURL).href);
		expect(served.status()).toBe(200);
		expect((await served.body()).byteLength).toBeGreaterThan(0);
	} finally {
		restoreDoc(GETTING_STARTED_FILE, original);
		if (committed && existsSync(join(MEDIA_DIR, committed))) {
			rmSync(join(MEDIA_DIR, committed));
		}
	}
});

test('choosing an existing upload under the local forge stores its served URL', async ({ page }) => {
	const original = readDoc(GETTING_STARTED_FILE);
	const document = JSON.parse(original) as {
		content: Array<{ type: string; attrs?: Record<string, unknown> }>;
	};
	const image = document.content.find((node) => node.type === 'image');
	if (!image?.attrs) throw new Error('getting-started.json must contain an Image block.');
	image.attrs.src = '';
	if (!uploads().includes('basic-editor.png')) {
		throw new Error('The docs media dir must contain basic-editor.png.');
	}

	try {
		restoreDoc(GETTING_STARTED_FILE, JSON.stringify(document, null, '\t'));
		await page.goto('/getting-started/edit/');

		const editor = page.locator('.uncial-cms-editor-page');
		await editor.getByRole('button', { name: 'Image', exact: true }).click();
		await editor.getByRole('button', { name: 'Choose existing', exact: true }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'basic-editor.png' }).click();

		await expect(editor.locator('.ProseMirror figure.uncial-image img')).toHaveAttribute(
			'src',
			'/uploads/basic-editor.png'
		);
		await expect
			.poll(
				() =>
					(
						JSON.parse(readDoc(GETTING_STARTED_FILE)) as typeof document
					).content.find((node) => node.type === 'image')?.attrs?.src,
				{ message: 'autosave writes the chosen served URL to the document', timeout: 15_000 }
			)
			.toBe('/uploads/basic-editor.png');
	} finally {
		restoreDoc(GETTING_STARTED_FILE, original);
	}
});
