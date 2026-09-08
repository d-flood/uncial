import { describe, expect, it } from 'vitest';
import { defineSite } from './define-site.js';
import { servedUrl } from './served-url.js';

const siteWith = (mediaDir: string | undefined) =>
	defineSite({ contentDir: 'content', mediaDir }, { dev: true });

describe('servedUrl', () => {
	it('drops the static prefix a committed asset is served without', () => {
		const site = siteWith('static/uploads');

		expect(servedUrl(site, 'static/uploads/abc123.webp')).toBe('/uploads/abc123.webp');
	});

	it('honours a static dir nested under the repo root', () => {
		const site = siteWith('packages/docs/static/uploads');

		expect(servedUrl(site, 'packages/docs/static/uploads/abc.png', 'packages/docs/static')).toBe(
			'/uploads/abc.png'
		);
	});

	it('returns the path site-root-absolute when mediaDir is not under the static dir', () => {
		const site = siteWith('assets/uploads');

		expect(servedUrl(site, 'assets/uploads/abc.png')).toBe('/assets/uploads/abc.png');
	});

	it('returns the path site-root-absolute when the site declares no mediaDir', () => {
		const site = siteWith(undefined);

		expect(servedUrl(site, 'static/uploads/abc.png')).toBe('/static/uploads/abc.png');
	});

	it('applies no base path, so a stored src survives any paths.base', () => {
		const site = siteWith('static/uploads');

		expect(servedUrl(site, 'static/uploads/abc.webp').startsWith('/uploads/')).toBe(true);
	});
});
