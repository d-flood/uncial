import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import type { MediaItem, MediaSource } from '../media-source.js';
import MediaLibrary from './MediaLibrary.svelte';

const item: MediaItem = {
	id: 'folio',
	url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
	filename: 'folio.svg',
	contentType: 'image/svg+xml',
	size: 2048,
	title: 'Folio 12 recto',
	usage: [{ path: '/about/' }]
};

function source(capabilities: MediaSource['capabilities']): MediaSource {
	return {
		capabilities,
		list: vi.fn(async () => [item]),
		upload: vi.fn(async () => item),
		delete: vi.fn(async () => {})
	};
}

describe('MediaLibrary', () => {
	it('renders titles, usage and search from a source that has them', async () => {
		const server = source({ metadata: true, usage: true, delete: true, search: true });
		render(MediaLibrary, { source: server });

		await expect.element(page.getByText('Folio 12 recto')).toBeInTheDocument();
		await expect.element(page.getByText('folio.svg · 2 KB')).toBeInTheDocument();
		await expect
			.element(page.getByText('In use by 1 Content document: /about/'))
			.toBeInTheDocument();
		await expect.element(page.getByRole('searchbox', { name: 'Search media' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Upload' })).toBeEnabled();
		await expect
			.element(page.getByRole('button', { name: 'Delete Folio 12 recto' }))
			.toBeEnabled();
		expect(server.list).toHaveBeenCalledWith({ search: '' });
	});

	it('hides metadata and usage UI when the capabilities say so', async () => {
		const git = source({ metadata: false, usage: false, delete: true, search: false });
		render(MediaLibrary, { source: git });

		await expect.element(page.getByText('folio.svg · 2 KB')).toBeInTheDocument();
		await expect.element(page.getByText('Folio 12 recto')).not.toBeInTheDocument();
		await expect.element(page.getByText(/in use/i)).not.toBeInTheDocument();
		await expect.element(page.getByRole('searchbox')).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Delete folio.svg' })).toBeEnabled();
		expect(git.list).toHaveBeenCalledWith({});
	});

	it('asks confirmDelete first and shows a refused delete in an alert', async () => {
		const server = source({ metadata: true, usage: true, delete: true, search: true });
		vi.mocked(server.delete).mockRejectedValueOnce(new Error('This Media item is in use.'));
		const confirmDelete = vi.fn(async () => true);
		render(MediaLibrary, { source: server, confirmDelete });

		await page.getByRole('button', { name: 'Delete Folio 12 recto' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('This Media item is in use.');
		expect(confirmDelete).toHaveBeenCalledWith(item);
		expect(server.delete).toHaveBeenCalledWith(item);
	});

	it('hides upload and delete that can() refuses', async () => {
		const git = source({ metadata: false, usage: false, delete: true, search: false });
		const can = vi.fn(() => false);
		render(MediaLibrary, { source: git, can });

		await expect.element(page.getByText('folio.svg · 2 KB')).toBeInTheDocument();
		await expect.element(page.getByRole('button')).not.toBeInTheDocument();
		expect(can).toHaveBeenCalledWith('media-upload', undefined);
		expect(can).toHaveBeenCalledWith('media-delete', item);
	});
});
