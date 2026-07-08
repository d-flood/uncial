import { defineConfig } from '@playwright/test';

// Builds the static docs site and serves it (mirrors uncial-cms's demo e2e).
// BUILD_DIR / KIT_OUT_DIR isolate the e2e build from a plain `bun run build`.
export default defineConfig({
	testDir: 'e2e',
	webServer: [
		{
			command:
				'BUILD_DIR=.e2e-build/plain KIT_OUT_DIR=.svelte-kit-e2e-plain vite build && node scripts/serve-static.mjs .e2e-build/plain 4331',
			port: 4331,
			timeout: 180_000
		}
	],
	projects: [
		{
			name: 'docs',
			testMatch: /docs-smoke\.test\.ts/,
			use: { baseURL: 'http://localhost:4331' }
		}
	]
});
