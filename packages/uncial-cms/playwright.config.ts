import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command:
			'vite build --config vite.fixture.config.ts && vite preview --config vite.fixture.config.ts --port 4318',
		port: 4318
	},
	testDir: 'e2e'
});
