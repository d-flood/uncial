import { defineConfig } from '@playwright/test';

// Two servers, because the docs prove both halves of one declaration: the
// production build (GitHub forge, Save button, mocked Contents API) and `vite
// dev` (local forge, autosave, real files under content/docs/).
// BUILD_DIR / KIT_OUT_DIR isolate the e2e build from a plain `pnpm run build`.
export default defineConfig({
	// The dev project edits the checkout's real documents through the local
	// forge, so two of its tests holding the same file open at once would each
	// see the other's writes as a conflict. One worker for the whole run.
	workers: 1,
	webServer: [
		{
			command:
				'BUILD_DIR=.e2e-build/plain KIT_OUT_DIR=.svelte-kit-e2e-plain vite build && node scripts/serve-static.mjs .e2e-build/plain 4331',
			port: 4331,
			timeout: 180_000
		},
		{
			// The local-forge plugin binds the dev server to loopback, so the URL
			// Playwright waits on has to name it rather than `localhost`.
			command: 'vite dev --port 4332 --strictPort',
			url: 'http://127.0.0.1:4332/getting-started/',
			timeout: 180_000
		}
	],
	projects: [
		{
			name: 'docs',
			testDir: 'e2e',
			testMatch: /\.test\.ts$/,
			testIgnore: /e2e\/dev\//,
			use: { baseURL: 'http://localhost:4331' }
		},
		{
			name: 'dev',
			testDir: 'e2e/dev',
			testMatch: /\.test\.ts$/,
			use: { baseURL: 'http://127.0.0.1:4332' }
		}
	]
});
