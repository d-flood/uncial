import { describe, expect, it } from 'vitest';
import {
	DEFAULT_APP_SLUG,
	DEFAULT_AUTH_WORKER_URL,
	defineSite,
	type SiteOptions
} from './define-site.js';

const github = { repo: 'd-flood/uncial', branch: 'main' };
const options: SiteOptions = { contentDir: 'packages/uncial-docs/content/docs', github };

describe('defineSite', () => {
	it('resolves the local forge in a development build even when a forge is declared', () => {
		const site = defineSite(options, { dev: true });

		expect(site.config).toEqual({
			forge: 'local',
			contentDir: 'packages/uncial-docs/content/docs',
			mediaDir: undefined
		});
		expect(site.localOnly).toBe(false);
	});

	it('resolves the declared forge in a production build, filling the canonical defaults', () => {
		const site = defineSite({ ...options, mediaDir: 'static/media' }, { dev: false });

		expect(site.config).toEqual({
			forge: 'github',
			repo: 'd-flood/uncial',
			branch: 'main',
			contentDir: 'packages/uncial-docs/content/docs',
			authWorkerUrl: DEFAULT_AUTH_WORKER_URL,
			appSlug: DEFAULT_APP_SLUG,
			mediaDir: 'static/media'
		});
		expect(site.localOnly).toBe(false);
	});

	it('keeps a declared auth worker and app slug over the defaults', () => {
		const site = defineSite(
			{ ...options, github: { ...github, authWorkerUrl: 'https://auth.example', appSlug: 'mine' } },
			{ dev: false }
		);

		expect(site.config).toMatchObject({ authWorkerUrl: 'https://auth.example', appSlug: 'mine' });
	});

	it('is local-only, and does not throw, when no forge is declared in a production build', () => {
		const site = defineSite({ contentDir: 'content' }, { dev: false });

		expect(site.localOnly).toBe(true);
		expect(site.config.forge).toBe('local');
	});

	it('surfaces autosaveMs only while the resolved forge is local', () => {
		expect(defineSite({ ...options, autosaveMs: 800 }, { dev: true }).autosaveMs).toBe(800);
		expect(defineSite({ ...options, autosaveMs: 800 }, { dev: false }).autosaveMs).toBeUndefined();
	});

	it('defaults localContentDir to contentDir', () => {
		expect(defineSite({ contentDir: 'content/docs' }, { dev: true }).localContentDir).toBe(
			'content/docs'
		);
		expect(
			defineSite({ contentDir: 'packages/site/content', localContentDir: 'content' }, { dev: true })
				.localContentDir
		).toBe('content');
	});
});
