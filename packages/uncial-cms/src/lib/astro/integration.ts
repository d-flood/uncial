import { writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration, ViteUserConfig } from 'astro';
import type { SiteOptions } from '../define-site.js';
import { uncialCms as uncialCmsVite, type UncialCmsPluginOptions } from '../vite/index.js';

export type UncialCmsAstroOptions =
	| { site?: undefined; host?: UncialCmsPluginOptions['host'] }
	| {
			/** The site module, from the project root; its `site` export is the Site object. */
			site: string;
			/** An Astro layout, from the project root, that renders its default `<slot />`. */
			layout: string;
			host?: UncialCmsPluginOptions['host'];
	  };

function importPath(from: string, root: URL, path: string): string {
	const rel = relative(from, fileURLToPath(new URL(path, root))).split('\\').join('/');
	return JSON.stringify(rel.startsWith('.') ? rel : `./${rel}`);
}

function writeRoutes(dir: URL, root: URL, site: string, layout: string) {
	const from = fileURLToPath(dir);
	const siteImport = `import { site } from ${importPath(from, root, site)};`;
	const layoutImport = `import Layout from ${importPath(from, root, layout)};`;
	const files: Record<string, string> = {
		'Editor.svelte': `<script lang="ts">
	import { EditorSurface } from 'uncial-cms/astro/editor';
	${siteImport}

	let { sourcePath, pagePath }: { sourcePath: string; pagePath: string } = $props();
</script>

<EditorSurface {site} {sourcePath} {pagePath} />
`,
		'Dashboard.svelte': `<script lang="ts">
	import { Dashboard } from 'uncial-cms/svelte';
	${siteImport}
</script>

<Dashboard {site} />
`,
		'edit.astro': `---
import { editorRoutes } from 'uncial-cms/astro';
${layoutImport}
${siteImport}
import Editor from './Editor.svelte';

export function getStaticPaths() {
	return editorRoutes(site).getStaticPaths();
}

const { sourcePath, pagePath } = Astro.props;
---

<Layout><Editor client:only="svelte" {sourcePath} {pagePath} /></Layout>
`,
		'dashboard.astro': `---
${layoutImport}
import Dashboard from './Dashboard.svelte';
---

<Layout><Dashboard client:only="svelte" /></Layout>
`
	};
	for (const [name, source] of Object.entries(files)) writeFileSync(new URL(name, dir), source);
}

/**
 * Installs the Vite plugins of `uncial-cms/vite`. Given the site module and a
 * layout, also injects the Editor variant and Dashboard routes.
 */
export function uncialCms(
	options: SiteOptions,
	plugin: UncialCmsAstroOptions = {}
): AstroIntegration {
	return {
		name: 'uncial-cms',
		hooks: {
			'astro:config:setup': ({ config, createCodegenDir, injectRoute, updateConfig }) => {
				// Typed against the Vite this package builds with, which need not be
				// the one Astro bundles; the plugins use only hooks both versions share.
				const plugins = uncialCmsVite(options, {
					site: plugin.site,
					host: plugin.host
				}) as NonNullable<ViteUserConfig['plugins']>;
				updateConfig({ vite: { plugins } });
				if (plugin.site === undefined) return;
				const dir = createCodegenDir();
				writeRoutes(dir, config.root, plugin.site, plugin.layout);
				injectRoute({ pattern: '/[...path]/edit', entrypoint: new URL('edit.astro', dir) });
				injectRoute({ pattern: '/uncial', entrypoint: new URL('dashboard.astro', dir) });
			}
		}
	};
}
