import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), devtoolsJson()],
	optimizeDeps: {
		include: [
			'phosphor-svelte/lib/ArrowDownIcon',
			'phosphor-svelte/lib/ArrowUpIcon',
			'phosphor-svelte/lib/BracketsCurlyIcon',
			'phosphor-svelte/lib/CodeIcon',
			'phosphor-svelte/lib/CodeBlockIcon',
			'phosphor-svelte/lib/DotsSixVerticalIcon',
			'phosphor-svelte/lib/EyeIcon',
			'phosphor-svelte/lib/LinkIcon',
			'phosphor-svelte/lib/ListBulletsIcon',
			'phosphor-svelte/lib/ListNumbersIcon',
			'phosphor-svelte/lib/MinusIcon',
			'phosphor-svelte/lib/PencilSimpleIcon',
			'phosphor-svelte/lib/QuotesIcon',
			'phosphor-svelte/lib/RocketIcon',
			'phosphor-svelte/lib/SquaresFourIcon',
			'phosphor-svelte/lib/StarIcon',
			'phosphor-svelte/lib/TextBIcon',
			'phosphor-svelte/lib/TextHFiveIcon',
			'phosphor-svelte/lib/TextHFourIcon',
			'phosphor-svelte/lib/TextHSixIcon',
			'phosphor-svelte/lib/TextHThreeIcon',
			'phosphor-svelte/lib/TextHTwoIcon',
			'phosphor-svelte/lib/TextItalicIcon',
			'phosphor-svelte/lib/TextStrikethroughIcon',
			'phosphor-svelte/lib/TrashIcon',
			'phosphor-svelte/lib/UserIcon',
			'phosphor-svelte/lib/XIcon'
		]
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
