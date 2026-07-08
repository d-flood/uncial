import { afterEach, describe, expect, it } from 'vitest';

import {
	FALLBACK_IMAGES_URL,
	getActiveApiUrls,
	imagePreviewUrl,
	imagesListUrl,
	setActiveApiUrls
} from './apiUrls.js';

afterEach(() => {
	setActiveApiUrls(undefined);
});

describe('imagesListUrl', () => {
	it('falls back to the hardcoded path without config', () => {
		expect(imagesListUrl()).toBe(FALLBACK_IMAGES_URL);
		expect(imagesListUrl({})).toBe(FALLBACK_IMAGES_URL);
	});

	it('uses the configured images endpoint', () => {
		expect(imagesListUrl({ images: '/cms-admin/api/uncial/images/' })).toBe(
			'/cms-admin/api/uncial/images/'
		);
	});

	it('reads the active config set by the admin bundle', () => {
		setActiveApiUrls({ images: '/mounted/images/' });
		expect(imagesListUrl()).toBe('/mounted/images/');
		expect(getActiveApiUrls()).toEqual({ images: '/mounted/images/' });
	});
});

describe('imagePreviewUrl', () => {
	it('substitutes the image id into the /0/ marker', () => {
		expect(imagePreviewUrl(42, { imagePreview: '/api/uncial/images/0/preview/' })).toBe(
			'/api/uncial/images/42/preview/'
		);
	});

	it('substitutes the last /0/ marker so prefixed mounts stay intact', () => {
		expect(imagePreviewUrl(7, { imagePreview: '/0/api/images/0/preview/' })).toBe(
			'/0/api/images/7/preview/'
		);
	});

	it('falls back to the hardcoded path without a template', () => {
		expect(imagePreviewUrl(5)).toBe('/api/uncial/images/5/preview/');
		expect(imagePreviewUrl(5, {})).toBe('/api/uncial/images/5/preview/');
	});

	it('falls back when the template lacks the /0/ marker', () => {
		expect(imagePreviewUrl(5, { imagePreview: '/broken/preview/' })).toBe(
			'/api/uncial/images/5/preview/'
		);
	});

	it('uses the active config set by the admin bundle', () => {
		setActiveApiUrls({ imagePreview: '/cms/images/0/preview/' });
		expect(imagePreviewUrl(9)).toBe('/cms/images/9/preview/');
	});
});
