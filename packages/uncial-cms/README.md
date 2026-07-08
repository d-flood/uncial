# uncial-cms

Git-forge-backed static CMS runtime for [Uncial](https://github.com/d-flood/uncial).
Every content page is a JSON document in your site's git repository — the
repository is the **single source of truth**. The build renders each content
page *and* a matching editor variant; an editor visits `/about/edit/`, signs in
with their GitHub account, and edits the page in place with the same components
and layout. Saving commits the JSON back to the repo, which triggers your
normal deploy. There is no CMS server, no database, and no user table.

**[Live demo →](https://d-flood.github.io/uncial/cms-demo/)** — a prerendered
SvelteKit site that edits this repository itself.

## How it works

- A content page `/about/` is backed by `content/about.json` (a normalized
  Uncial document). Nested paths map naturally: `/blog/hello/` ↔
  `content/blog/hello.json`.
- Production (non-editor) pages ship **zero** uncial-cms JavaScript. The editing
  surface exists only on generated editor variants (`/about/edit/`) and the site
  index (`/uncial/`).
- **Load:** the runtime fetches the JSON + its blob sha live from the forge
  (never the baked build output), normalizes it, and mounts `<uncial-editor>`.
- **Save:** validate → serialize → commit with the recorded sha (optimistic
  concurrency) → poll commit status and surface *building… / live*.
- **Conflict:** a stale sha yields a 409 that surfaces a blocking banner —
  download your version, or reload the latest — never a silent overwrite.

## Install

```sh
npm install uncial-cms uncial
pnpm add uncial-cms uncial
bun add uncial-cms uncial
```

`uncial` is a peer dependency. `@sveltejs/kit` and `svelte` are peers of the
`uncial-cms/sveltekit` subpath only — the runtime root never imports them.

## Exports

- `uncial-cms` — framework-agnostic browser runtime: `mountEditorPage`,
  `mountIndexPage`, `createPage`/`deletePage`/`listPages`, the session providers
  (`popupSessionProvider`, `patSessionProvider`), path helpers, `ConflictError`,
  `NotFoundError`, and the shared types (`UncialCmsSiteConfig`, `ForgeSession`,
  `SessionProvider`, `ForgeAdapter`).
- `uncial-cms/github` — the GitHub `ForgeAdapter` (`createGitHubAdapter`) over
  the Contents API, plus the two session providers.
- `uncial-cms/sveltekit` — build-time route factories for prerendered SvelteKit
  sites (`createContentHandlers`, `createEditorHandlers`, `createIndexHandlers`,
  and the default path↔source mapping).

## Site config

The config is baked into each generated page at build time (only the *mapping*
is static; content is always fetched live):

```ts
import type { UncialCmsSiteConfig } from 'uncial-cms';

export const siteConfig: UncialCmsSiteConfig = {
	forge: 'github',
	repo: 'owner/name',
	branch: 'main',
	contentDir: 'content',        // repo-root-relative
	authWorkerUrl: 'https://uncial-cms-auth.dflood.workers.dev',
	appSlug: 'uncial-cms'         // GitHub App slug, for install links
};
```

## Quick start: SvelteKit route factories

The `uncial-cms/sveltekit` subpath gives you build-time factories; you own three
route files (explicit and debuggable — factories never register routes
implicitly). Alongside them, define the site config and your block registry:

```ts
// src/routes/site.ts
import { createBlockRegistry, createSchema } from 'uncial/core';
import type { UncialCmsSiteConfig } from 'uncial-cms';

export const siteConfig: UncialCmsSiteConfig = {
	forge: 'github',
	repo: 'owner/name',
	branch: 'main',
	contentDir: 'content',
	authWorkerUrl: 'https://uncial-cms-auth.dflood.workers.dev',
	appSlug: 'uncial-cms'
};

export const blocks = createBlockRegistry([]);
export const schema = createSchema(blocks, {
	metaFields: { title: { default: 'Untitled page', required: true } }
});

// FS path of the content dir at build time (differs from config.contentDir,
// which is repo-root-relative for the forge API).
export const localContentDir = 'content';
```

**1. Content catch-all** — `src/routes/[...path]/+page.server.ts` (prerendered
content pages, no CMS JS):

```ts
import { createContentHandlers } from 'uncial-cms/sveltekit';
import { blocks, localContentDir, schema, siteConfig } from '../site.js';

const handlers = createContentHandlers({ config: siteConfig, blocks, schema, localContentDir });
export const entries = handlers.entries; // derived from the content dir
export const load = handlers.load;
```

**2. Editor variant** — `src/routes/[...path]/edit/+page.server.ts` bakes the
mapping only; the document is loaded client-side:

```ts
import { createEditorHandlers } from 'uncial-cms/sveltekit';
import { blocks, localContentDir, schema, siteConfig } from '../../site.js';

const handlers = createEditorHandlers({ config: siteConfig, blocks, schema, localContentDir });
export const entries = handlers.entries;
export const load = handlers.load;
```

```svelte
<!-- src/routes/[...path]/edit/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { mountEditorPage } from 'uncial-cms';
	import { blocks, schema, siteConfig } from '../../site.js';

	let { data } = $props();
	let target: HTMLElement;

	onMount(() => {
		const handle = mountEditorPage(target, {
			config: siteConfig,
			sourcePath: data.sourcePath,
			pagePath: data.path,
			blocks,
			schema
			// Uses the default popupSessionProvider; authWorkerUrl is set in site.ts.
		});
		return () => handle.destroy();
	});
</script>

<div bind:this={target}></div>
```

**3. Site index** — `src/routes/uncial/+page.server.ts` + `+page.svelte`
(OAuth landing, create/delete, hash-routed fallback editor):

```ts
import { createIndexHandlers } from 'uncial-cms/sveltekit';
import { blocks, schema, siteConfig } from '../site.js';

const handlers = createIndexHandlers({ config: siteConfig, blocks, schema });
export const load = handlers.load;
```

```svelte
<!-- src/routes/uncial/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { mountIndexPage } from 'uncial-cms';
	import { blocks, schema, siteConfig } from '../site.js';

	let target: HTMLElement;
	onMount(() => {
		const handle = mountIndexPage(target, { config: siteConfig, blocks, schema, basePath: base });
		return () => handle.destroy();
	});
</script>

<div bind:this={target}></div>
```

When the site is served under a base path (e.g. GitHub Pages project sites at
`/owner/repo/`), pass the framework's base path to `mountIndexPage` (`basePath`)
so live-page links resolve; the default mapping always operates on
**site-relative** paths with the base stripped.

## Plain-HTML / web-component usage

The runtime is framework-agnostic: `mountEditorPage` mounts into any
`HTMLElement` and pulls in Uncial's web-components entry itself. No build step or
framework is required — this is the same path the SvelteKit helper uses under
the hood.

```html
<div id="editor"></div>
<script type="module">
	import { mountEditorPage } from 'uncial-cms';
	import { createBlockRegistry, createSchema } from 'uncial/core';

	const blocks = createBlockRegistry([]);
	const schema = createSchema(blocks, {
		metaFields: { title: { default: 'Untitled', required: true } }
	});

	mountEditorPage(document.getElementById('editor'), {
		config: {
			forge: 'github',
			repo: 'owner/name',
			branch: 'main',
			contentDir: 'content',
			authWorkerUrl: 'https://uncial-cms-auth.dflood.workers.dev',
			appSlug: 'uncial-cms'
		},
		sourcePath: 'content/about.json',
		blocks,
		schema
	});
</script>
```

## Session providers

Authentication is owned entirely by the session provider passed to
`mountEditorPage`/`mountIndexPage` (the `sessionProvider` option). Two ship in
the box:

- **`popupSessionProvider` (default).** Opens the auth worker in a popup, runs a
  PKCE dance, and receives a GitHub App installation token **scoped to the one
  configured repository** (~1 hour, contents read/write). The user's OAuth token
  never reaches the browser. Requires `authWorkerUrl` in the config and the
  [`uncial-cms-auth`](../uncial-cms-auth) worker (a canonical hosted instance
  exists; self-hosting is first-class). Tokens live in `sessionStorage` per repo;
  on expiry the popup re-runs, and GitHub skips re-consent so renewal is a flash.
- **`patSessionProvider`.** Zero-backend mode: prompts for a fine-grained
  personal access token (contents read/write on the target repo) and validates
  it via `GET /user`. The permanent dev / self-service mode — no worker needed.

```ts
import { patSessionProvider } from 'uncial-cms';
mountEditorPage(target, { config, sourcePath, blocks, schema, sessionProvider: patSessionProvider });
```

## Security model

- **Repo-scoped tokens.** The token delivered to the browser is a GitHub App
  installation token restricted to a single repository (`repositories: [name]`)
  with contents read/write and ~1h expiry. A leaked token cannot reach the
  user's other repositories, and there is no user token in the browser at all.
- **Origin↔repo allowlist.** The worker mints a token only if the initiating
  origin appears in `.uncial/cms.json`, committed to the target repo's default
  branch, so a malicious origin cannot claim to be the editor for a repo whose
  owners never listed it:

  ```json
  // .uncial/cms.json
  { "allowedOrigins": ["https://example.com", "http://localhost:5173"] }
  ```

- **sha-checked writes.** Concurrent edits produce a 409 and an explicit user
  choice, never a silent overwrite. Editor variants and the index must not load
  third-party scripts — the blast radius of XSS is capped at one repo for ≤1h.

Residual risks accepted for v1 (see the spec's §6.5 for the full treatment):

- A user with push access can add origins to `.uncial/cms.json`; branch
  protection on that path is the site owner's mitigation.
- On **shared-origin hosts** (e.g. `<user>.github.io`, where every project page
  of an account shares one origin), allowlisting the origin authorizes every
  site served from it. Acceptable when all sites on the origin belong to the repo
  owner — the demo's case — but on a shared host a **custom domain restores
  per-site granularity**.
- Phishing remains possible in principle; the repo-scoped token caps the damage
  to repos the victim can push to *and* whose allowlist names the attacker
  origin — i.e. near zero.

## v1 limitations & roadmap

Deliberately out of scope for v1 (tracked as future design rounds):

- **No media / image upload.** Image-bearing block attributes accept URL
  strings; there is no upload UI or repo media handling. A media strategy is a
  separate future round.
- **No drafts / PR workflows.** Save commits directly to the configured branch.
  Editorial review in v1 is git **branch protection**, configured by the site
  owner. A save-to-branch toggle is a candidate for v1.x.
- **GitHub only.** v1 ships the forge-adapter *interface* (validated on paper
  against GitLab's client-side PKCE) and the GitHub implementation only. **GitLab**
  / Gitea adapters are future work; nothing outside the adapter assumes a worker
  exists.

## Development

```sh
bun run check              # svelte-check
bun run test:unit -- --run # vitest (node)
bun run test:e2e           # Playwright: plain-HTML fixture + built demo + base-path demo
bun run prepack            # svelte-package → dist, then publint
```
