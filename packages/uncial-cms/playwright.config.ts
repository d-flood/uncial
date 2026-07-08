import { defineConfig } from '@playwright/test';

// Three servers: the plain-HTML fixture (proves the framework-free runtime),
// the built demo site, and the same demo built under a GitHub-Pages-style
// base path (regression test for site-relative source mapping).
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
			testMatch: /demo-editor\.test\.ts/,
			use: { baseURL: 'http://localhost:4319' }
		},
		{
			name: 'demo-base-path',
			testMatch: /demo-editor-base\.test\.ts/,
			use: { baseURL: 'http://localhost:4320' }
		}
	]
});
