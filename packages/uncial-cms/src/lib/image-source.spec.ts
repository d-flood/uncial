import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_CONTENT_BYTES } from './constants.js';
import { defineSite } from './define-site.js';
import { NotFoundError } from './errors.js';
import type { ImageEncoder } from './fit-image.js';
import { cmsImageSource } from './image-source.js';
import type { ForgeAdapter } from './types.js';
import { clearActiveForge, setActiveForge } from './upload-context.js';

// The browser encoder needs a canvas; the descent itself stays real.
const encoder: ImageEncoder = {
	decode: async (file) => (file.size > MAX_CONTENT_BYTES ? { width: 3000, height: 2000 } : { width: 8, height: 8 }),
	encode: async () => new Blob([new Uint8Array(32)], { type: 'image/webp' })
};
vi.mock('./fit-image.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./fit-image.js')>();
	return {
		...actual,
		fitImage: (file: Blob, opts: Parameters<typeof actual.fitImage>[1]) =>
			actual.fitImage(file, { ...opts, encoder })
	};
});

const author = { name: 'Octo Cat', email: 'octocat@users.noreply.github.com' };
const config = defineSite(
	{ contentDir: 'content', mediaDir: 'packages/docs/static/uploads' },
	{ dev: true }
).config;

function fakeAdapter(): ForgeAdapter {
	return {
		authenticate: vi.fn(),
		readFile: vi.fn().mockRejectedValue(new NotFoundError('missing')),
		writeFile: vi.fn().mockResolvedValue({ sha: 'sha-new', commitSha: 'commit-new' }),
		deleteFile: vi.fn().mockResolvedValue(undefined),
		listDir: vi.fn().mockResolvedValue([]),
		commitStatus: vi.fn().mockResolvedValue('unknown')
	};
}

describe('cmsImageSource', () => {
	afterEach(() => clearActiveForge());

	const source = () => cmsImageSource(config, { base: '/site', staticDir: 'packages/docs/static' });

	it('uploads through the active forge and answers the served URL of the committed file', async () => {
		const adapter = fakeAdapter();
		setActiveForge({ adapter, author, config });
		const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'shot.png', {
			type: 'image/png'
		});

		const src = await source().upload!(file);

		expect(src).toMatch(/^\/uploads\/[0-9a-f]+\.png$/);
		const [path] = vi.mocked(adapter.writeFile).mock.calls[0]!;
		expect(path).toBe(`packages/docs/static${src}`);
	});

	it('commits an oversize input as WebP', async () => {
		const adapter = fakeAdapter();
		setActiveForge({ adapter, author, config });
		const huge = new File([new Uint8Array(MAX_CONTENT_BYTES + 1)], 'huge.png', { type: 'image/png' });

		const src = await source().upload!(huge);

		expect(src).toMatch(/^\/uploads\/[0-9a-f]+\.webp$/);
		const [path, content] = vi.mocked(adapter.writeFile).mock.calls[0]!;
		expect(path).toBe(`packages/docs/static${src}`);
		expect((content as Uint8Array).byteLength).toBeLessThanOrEqual(MAX_CONTENT_BYTES);
	});

	it('propagates the no-session error unchanged', async () => {
		const file = new File([new Uint8Array(4)], 'shot.png', { type: 'image/png' });

		await expect(source().upload!(file)).rejects.toThrow(/no active editor session/i);
	});

	it('resolves thumbnails against the base', () => {
		expect(source().thumbnail!('/uploads/a.png')).toBe('/site/uploads/a.png');
		expect(source().thumbnail!('blob:x')).toBe('blob:x');
	});
});
