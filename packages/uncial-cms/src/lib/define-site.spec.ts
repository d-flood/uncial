import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_SLUG, DEFAULT_AUTH_WORKER_URL } from './constants.js';
import { defineSite, type SiteOptions } from './define-site.js';

const github = { repo: 'd-flood/uncial', branch: 'main' };
const options: SiteOptions = { contentDir: 'content', github, autosaveMs: 800 };
const model = { blocks: [] };

describe('defineSite', () => {
	it('resolves the local forge in development and the declared forge in production', () => {
		const dev = defineSite(options, model, { dev: true });
		const prod = defineSite(options, model, { dev: false });

		expect(dev.config).toMatchObject({ forge: 'local', contentDir: 'content' });
		expect(dev.autosaveMs).toBe(800);
		expect(prod.config).toMatchObject({
			forge: 'github',
			authWorkerUrl: DEFAULT_AUTH_WORKER_URL,
			appSlug: DEFAULT_APP_SLUG
		});
		expect(prod.autosaveMs).toBeUndefined();
		expect(defineSite({ contentDir: 'content' }, model, { dev: false }).localOnly).toBe(true);
	});

	it.each([
		{ kind: 'worker', url: 'https://auth.example', appSlug: 'mine' },
		{ kind: 'broker', origin: 'https://broker.example', clientId: 'id', appSlug: 'mine' }
	] as const)('takes the App slug from github.auth %o', (auth) => {
		const site = defineSite({ ...options, github: { ...github, auth } }, model, { dev: false });

		expect(site.config).toMatchObject({ appSlug: 'mine' });
	});
});
