import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { createBlockRegistry, createSchema } from 'uncial/core';
import { defineSite } from '../define-site.js';
import EditorPage from './EditorPage.svelte';

const blocks = createBlockRegistry([]);
const schema = createSchema(blocks, { metaFields: {} });

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	document.documentElement.style.removeProperty('color-scheme');
	vi.restoreAllMocks();
});

it('follows the host color-scheme, not the operating system preference', async () => {
	globalThis.fetch = vi.fn(
		async () =>
			new Response(
				JSON.stringify({
					content: JSON.stringify({ type: 'doc', version: 1, meta: {}, content: [] }),
					sha: 'sha-1'
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			)
	) as unknown as typeof fetch;

	const preference = matchMedia('(prefers-color-scheme: dark)').matches;
	render(EditorPage, {
		site: defineSite({ contentDir: 'content' }, { dev: true }),
		sourcePath: 'content/about.json',
		pagePath: 'about',
		blocks,
		schema
	});

	const shell = page.getByRole('textbox');
	await expect.element(shell).toBeInTheDocument();
	const tokenHost = shell.element().closest('.uncial-editor-shell') as HTMLElement;
	// An unregistered custom property computes to its token stream, so
	// `light-dark()` inside one only resolves where it is used as a colour.
	const probe = document.createElement('div');
	probe.style.backgroundColor = 'var(--uncial-color-surface)';
	tokenHost.append(probe);

	const light = getComputedStyle(probe).backgroundColor;
	document.documentElement.style.colorScheme = 'dark';
	const dark = getComputedStyle(probe).backgroundColor;
	probe.remove();

	expect(dark).not.toBe(light);
	expect(matchMedia('(prefers-color-scheme: dark)').matches).toBe(preference);
});
