# uncial-cms

A git-backed CMS for [Uncial](https://github.com/d-flood/uncial). Every page is a JSON document in your repository. The build renders each Content page and a matching Editor variant: an editor opens `/about/edit/`, signs in with GitHub, edits the page in place, and saves a commit that triggers your normal deploy. There is no CMS server and no database. SvelteKit and Astro are supported.

## Install

```sh
pnpm add uncial uncial-cms
pnpm exec uncial-cms init
```

`init` scaffolds a working local-only site and never overwrites a file.

## Quick start

```ts
// site.options.ts
export const siteOptions = {
	contentDir: 'content',
	github: { repo: 'owner/name', branch: 'main' }
} satisfies SiteOptions;

// src/lib/site.ts
export const site = defineSite(siteOptions, {
	base,
	blocks: import.meta.glob('./blocks/*.svelte', { eager: true }),
	templates: import.meta.glob('./templates/*.svelte', { eager: true }),
	meta: { title: { default: 'Untitled page', required: true } }
});

// vite.config.ts
plugins: [...uncialCms(siteOptions), sveltekit()]

// src/routes/[...path]/+page.server.ts
export const { entries, load } = contentRoutes(site);

// src/routes/[...path]/edit/+page.server.ts
export const { entries, load } = editorRoutes(site);
```

```svelte
<!-- [...path]/+page.svelte -->      <Page {site} {data} />
<!-- [...path]/edit/+page.svelte --> <EditorPage {site} {data} />
<!-- uncial/+page.svelte -->         <Dashboard {site} />
```

Then commit `.uncial/cms.json` with your site's origin, install the `uncial-cms` GitHub App, and run `pnpm exec uncial-cms doctor --origin https://example.com`.

## Docs

[A static site that edits itself](https://d-flood.github.io/uncial/docs/static-site/) walks the whole pattern. The [docs](https://d-flood.github.io/uncial/docs/) cover the Dashboard, Globals, Collections, media and upgrading.
