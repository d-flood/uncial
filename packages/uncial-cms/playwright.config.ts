import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	webServer: [
		{
			command:
				'vite build --config vite.fixture.config.ts && vite preview --config vite.fixture.config.ts --port 4318',
			port: 4318
		},
		{
			command:
				'BUILD_DIR=.e2e-build/plain KIT_OUT_DIR=.svelte-kit-e2e-plain vite build && node scripts/serve-static.mjs .e2e-build/plain 4319',
			port: 4319,
			timeout: 180_000
		},
		{
			command:
				'BASE_PATH=/uncial/cms-demo BUILD_DIR=.e2e-build/base KIT_OUT_DIR=.svelte-kit-e2e-base vite build && node scripts/serve-static.mjs .e2e-build/base 4320 /uncial/cms-demo',
			port: 4320,
			timeout: 180_000
		},
		{
			// The local forge writes to a fresh copy of the fixture's content, and
			// binds the dev server to loopback, so the URL waited on names it.
			// pnpm puts binaries on PATH cwd-relatively, so a server with its own
			// cwd names them by path.
			command:
				'rm -rf ../../.e2e-build/local-forge && mkdir -p ../../.e2e-build/local-forge && cp -R content ../../.e2e-build/local-forge/ && UNCIAL_FIXTURE_ROOT=../../.e2e-build/local-forge ../../node_modules/.bin/vite dev --port 4325 --strictPort',
			cwd: 'e2e/local-only-site',
			url: 'http://127.0.0.1:4325/uncial/',
			timeout: 180_000
		},
		{
			// Its own outDir, so the Astro spec's build of the same site can run alongside.
			command:
				'../../node_modules/.bin/astro build --outDir ../../.e2e-build/astro-dashboard && node ../../scripts/serve-static.mjs ../../.e2e-build/astro-dashboard 4326',
			cwd: 'e2e/astro-site',
			port: 4326,
			timeout: 180_000
		}
	],
	projects: [
		{
			name: 'fixture',
			testMatch: /editor-page\.test\.ts/,
			use: { baseURL: 'http://localhost:4318' }
		},
		{
			name: 'demo',
			testMatch: /demo-(editor|index|media|globals)\.test\.ts/,
			use: { baseURL: 'http://localhost:4319' }
		},
		{
			name: 'demo-base-path',
			testMatch: /demo-editor-base\.test\.ts/,
			use: { baseURL: 'http://localhost:4320' }
		},
		{
			name: 'local-forge',
			testMatch: /local-forge\.test\.ts/,
			use: { baseURL: 'http://127.0.0.1:4325' }
		},
		{
			name: 'astro',
			testMatch: /astro-dashboard\.test\.ts/,
			use: { baseURL: 'http://localhost:4326' }
		}
	]
});
