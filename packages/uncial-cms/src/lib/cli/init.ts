/** `uncial-cms init`: scaffolds a local-only site into an existing SvelteKit or Astro project. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { CliOutput } from './assert-clean-pages.js';

export type Framework = 'sveltekit' | 'astro';

const siteOptions = (staticDir: string) => `import type { SiteOptions } from 'uncial-cms';

export const siteOptions = {
	contentDir: 'content',
	staticDir: '${staticDir}'
} satisfies SiteOptions;
`;

const siteModule = (
	head: string,
	options: string,
	base: string
) => `${head}import { defineSite } from 'uncial-cms';
import { siteOptions } from '${options}';

export const site = defineSite(siteOptions, {${base}
	blocks: import.meta.glob('./blocks/*.svelte', { eager: true }),
	templates: import.meta.glob('./templates/*.svelte', { eager: true }),
	meta: { title: { default: 'Untitled page', required: true } }
});
`;

const NOTE = `<script module lang="ts">
	import { defineBlock } from 'uncial';

	export const block = defineBlock({
		id: 'note',
		label: 'Note',
		attributes: { text: { default: 'Write a note.', input: 'textarea' } }
	});
</script>

<script lang="ts">
	import { Text } from 'uncial';
</script>

<aside><Text name="text" /></aside>
`;

const PAGE = `<script module lang="ts">
	import { defineTemplate } from 'uncial';

	export const template = defineTemplate({ id: 'page', label: 'Page' });
</script>

<script lang="ts">
	import { Text, type TemplateProps } from 'uncial';

	let { body }: TemplateProps<typeof template> = $props();
</script>

<main>
	<h1><Text name="title" /></h1>
	{@render body()}
</main>
`;

const content = (blockFile: string) =>
	`${JSON.stringify(
		{
			type: 'doc',
			version: 1,
			meta: { title: 'Home' },
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: 'Edit this page at /edit/.' }] },
				{ type: 'note', attrs: { text: `A Block, from ${blockFile}.` } }
			]
		},
		null,
		'\t'
	)}\n`;

const routeData = (
	factory: string,
	up: string
) => `import { ${factory} } from 'uncial-cms/sveltekit';
import { site } from '${up}lib/uncial/site.js';

export const { entries, load } = ${factory}(site);
`;

const routePage = (component: string, up: string, props = '') => `<script lang="ts">
	import { ${component} } from 'uncial-cms/svelte';
	import { site } from '${up}lib/uncial/site.js';
${props === '' ? '' : '\n\tlet { data } = $props();\n'}</script>

<${component} {site}${props} />
`;

const LAYOUT = ['export const prerender = true;', "export const trailingSlash = 'always';"];

const SVELTEKIT_FILES: Record<string, string> = {
	'site.options.ts': siteOptions('static'),
	'src/lib/uncial/site.ts': siteModule(
		"import { base } from '$app/paths';\n",
		'../../../site.options.js',
		'\n\tbase,'
	),
	'src/lib/uncial/blocks/Note.svelte': NOTE,
	'src/lib/uncial/templates/Page.svelte': PAGE,
	'src/routes/+layout.ts': `${LAYOUT.join('\n')}\n`,
	'src/routes/[...path]/+page.server.ts': routeData('contentRoutes', '../../'),
	'src/routes/[...path]/+page.svelte': routePage('Page', '../../', ' {data}'),
	'src/routes/[...path]/edit/+page.server.ts': routeData('editorRoutes', '../../../'),
	'src/routes/[...path]/edit/+page.svelte': routePage('EditorPage', '../../../', ' {data}'),
	'src/routes/uncial/+page.svelte': routePage('Dashboard', '../../'),
	'content/index.json': content('src/lib/uncial/blocks/Note.svelte')
};

const ASTRO_FILES: Record<string, string> = {
	'site.options.ts': siteOptions('public'),
	'src/uncial/site.ts': siteModule('', '../../site.options.ts', ''),
	'src/uncial/blocks/Note.svelte': NOTE,
	'src/uncial/templates/Page.svelte': PAGE,
	'src/uncial/Layout.astro': `<html lang="en">
	<head><meta charset="utf-8" /></head>
	<body><slot /></body>
</html>
`,
	'src/pages/[...path].astro': `---
import { Page } from 'uncial';
import { contentRoutes, type ContentPage } from 'uncial-cms/astro';
import Layout from '../uncial/Layout.astro';
import { site } from '../uncial/site.ts';

export function getStaticPaths() {
	return contentRoutes(site).getStaticPaths();
}

const { path, document } = Astro.props as ContentPage;
---

<Layout><Page model={site} {document} {path} /></Layout>
`,
	'content/index.json': content('src/uncial/blocks/Note.svelte')
};

/** Lines to add to the first of `configs` that exists, unless it already has every marker. */
interface Addition {
	configs: string[];
	markers: string[];
	lines: string[];
	/** The config object the lines go in. */
	inside?: string;
}

const CONFIG: Record<
	Framework,
	{
		label: string;
		files: Record<string, string>;
		additions: Addition[];
		homes: string[];
		install: string;
		port: number;
	}
> = {
	sveltekit: {
		label: 'SvelteKit',
		files: SVELTEKIT_FILES,
		additions: [
			{
				configs: ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs'],
				markers: ['uncialCms'],
				lines: [
					"import { uncialCms } from 'uncial-cms/vite';",
					"import { siteOptions } from './site.options.js';",
					'plugins: [...uncialCms(siteOptions), sveltekit()]'
				]
			},
			{
				configs: ['svelte.config.js', 'svelte.config.ts'],
				markers: ['handleUnseenRoutes'],
				lines: ["prerender: { handleUnseenRoutes: 'ignore' }"],
				inside: 'kit'
			},
			{
				configs: ['src/routes/+layout.ts', 'src/routes/+layout.js'],
				markers: ['prerender', 'trailingSlash'],
				lines: LAYOUT
			}
		],
		homes: ['src/routes/+page.svelte'],
		install: 'pnpm add uncial uncial-cms',
		port: 5173
	},
	astro: {
		label: 'Astro',
		files: ASTRO_FILES,
		additions: [
			{
				configs: ['astro.config.mjs', 'astro.config.ts', 'astro.config.js', 'astro.config.mts'],
				markers: ['uncialCms'],
				lines: [
					"import svelte from '@astrojs/svelte';",
					"import { uncialCms } from 'uncial-cms/astro';",
					"import { siteOptions } from './site.options.ts';",
					"integrations: [svelte(), uncialCms(siteOptions, { site: './src/uncial/site.ts', layout: './src/uncial/Layout.astro' })]"
				]
			}
		],
		homes: ['src/pages/index.astro', 'src/pages/index.md', 'src/pages/index.mdx'],
		install: 'pnpm add uncial uncial-cms svelte @astrojs/svelte',
		port: 4321
	}
};

// SvelteKit refuses a route module present as both `.js` and `.ts`.
const routeSibling = (path: string) =>
	basename(path).startsWith('+')
		? [path.replace(/\.([jt])s$/, (_, kind) => (kind === 'j' ? '.ts' : '.js'))]
		: [];

export function detectFramework(dir: string): Framework | null {
	const manifest = join(dir, 'package.json');
	if (!existsSync(manifest)) return null;
	const pkg = JSON.parse(readFileSync(manifest, 'utf-8'));
	const deps = { ...pkg.dependencies, ...pkg.devDependencies };
	if ('@sveltejs/kit' in deps) return 'sveltekit';
	if ('astro' in deps) return 'astro';
	return null;
}

export function init(dirArg: string, flag: Framework | undefined, io: CliOutput): number {
	const dir = resolve(dirArg);
	const framework = flag ?? detectFramework(dir);
	if (framework === null) {
		io.err(
			`No @sveltejs/kit or astro dependency in ${join(dir, 'package.json')}. Pass --sveltekit or --astro.`
		);
		return 2;
	}
	const { label, files, additions, homes, install, port } = CONFIG[framework];

	io.out(`uncial-cms init: ${label} site in ${dir}`);
	for (const [path, source] of Object.entries(files)) {
		const existing = [path, ...routeSibling(path)].find((name) => existsSync(join(dir, name)));
		if (existing !== undefined) {
			io.out(`  skipped ${path} (${existing === path ? '' : `${existing} `}exists)`);
			continue;
		}
		const target = join(dir, path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, source);
		io.out(`  wrote ${path}`);
	}

	const steps = [install];
	for (const { configs, markers, lines, inside } of additions) {
		const config = configs.find((name) => existsSync(join(dir, name))) ?? configs[0];
		const source = existsSync(join(dir, config)) ? readFileSync(join(dir, config), 'utf-8') : '';
		if (markers.every((marker) => source.includes(marker))) continue;
		io.out(`\nAdd to ${config}${inside ? `, inside ${inside}` : ''} (init never edits it):`);
		for (const line of lines) io.out(`  ${line}`);
		steps.push(`add the lines above to ${config}`);
	}
	const home = homes.find((path) => existsSync(join(dir, path)));
	if (home !== undefined) {
		io.out(`\n${home} shadows the home Content page; delete it to serve content/index.json.`);
	}
	steps.push(
		`pnpm dev, then open http://localhost:${port}/edit/ (the Dashboard is at /uncial/)`,
		'once a GitHub half is in site.options.ts, run uncial-cms doctor'
	);
	io.out('\nNext:');
	steps.forEach((step, i) => io.out(`  ${i + 1}. ${step}`));
	return 0;
}
