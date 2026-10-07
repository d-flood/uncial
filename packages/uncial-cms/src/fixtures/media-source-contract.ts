import { expect, it } from 'vitest';
import type { MediaSource } from '../lib/media-source.js';

const svg = (label: string) =>
	new File([`<svg xmlns="http://www.w3.org/2000/svg"><title>${label}</title></svg>`], `${label}.svg`, {
		type: 'image/svg+xml'
	});

export function mediaSourceContract(
	capabilities: MediaSource['capabilities'],
	open: () => Promise<MediaSource>
): void {
	it('declares its capabilities', async () => {
		expect((await open()).capabilities).toEqual(capabilities);
	});

	it('lists an upload by content type until it is deleted', async () => {
		const source = await open();
		const item = await source.upload(svg('round-trip'));
		expect(item.contentType).toBe('image/svg+xml');

		const listed = (await source.list({ contentType: 'image/*' })).find(({ id }) => id === item.id);
		expect(listed).toMatchObject({
			id: item.id,
			url: item.url,
			filename: item.filename,
			contentType: item.contentType
		});
		expect(listed!.title !== undefined).toBe(capabilities.metadata);
		expect(listed!.usage).toEqual(capabilities.usage ? [] : undefined);
		expect((await source.list({ contentType: 'application/pdf' })).map(({ id }) => id)).not.toContain(
			item.id
		);

		await source.delete(listed!);
		expect((await source.list()).map(({ id }) => id)).not.toContain(item.id);
	});

	it('answers one item for identical bytes', async () => {
		const source = await open();
		const first = await source.upload(svg('dedupe'));
		const second = await source.upload(svg('dedupe'));

		expect(second.id).toBe(first.id);
		expect((await source.list()).filter(({ id }) => id === first.id)).toHaveLength(1);
	});
}
