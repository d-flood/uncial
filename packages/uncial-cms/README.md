# uncial-cms

Git-forge-backed static CMS runtime for [Uncial](https://github.com/d-flood/uncial).
Every content page is a JSON document in your site's git repository — the
repository is the **single source of truth**. The build renders each content
page *and* a matching editor variant; an editor visits `/about/edit/`, signs in
with their GitHub account, and edits the page in place with the same components
and layout. Saving commits the JSON back to the repo, which triggers your
normal deploy. There is no CMS server, no database, and no user table.

**[Live demo →](https://d-flood.github.io/uncial/docs/)** — the Uncial docs are
a prerendered SvelteKit site managed by uncial-cms, editing this repository
itself. The docs are the live demo.

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
npm install uncial uncial-cms
pnpm add uncial uncial-cms
bun add uncial uncial-cms
```

`uncial` is a peer dependency. `svelte` is a peer of the `uncial-cms/svelte`
subpath, and `@sveltejs/kit` of `uncial-cms/sveltekit` — the runtime root
imports neither.

The package also ships a `uncial-cms` command; see
[The `uncial-cms` command](#the-uncial-cms-command).

## Exports

- `uncial-cms` — `defineSite`, the framework-agnostic browser runtime
  (`mountEditorPage`, `mountIndexPage`), `createPage`/`deletePage`/`listPages`,
  `uploadAsset`/`uploadImageAsset`/`fitImage`/`servedUrl` (see
  [Media](#media)), `parseDocument`/`serializeDocument`, the session providers
  (`popupSessionProvider`, `patSessionProvider`), `MAX_CONTENT_BYTES`,
  `ConflictError`, `NotFoundError`, and the shared types (`Site`,
  `SiteOptions`, `UncialCmsSiteConfig`, `ForgeSession`, `SessionProvider`,
  `ForgeAdapter`).
- `uncial-cms/svelte` — `EditorPage`, the Svelte component that is the
  recommended door onto an Editor variant in a SvelteKit site.
- `uncial-cms/session` — `createEditorSession`: the same editing session
  without a surface, for a framework host that renders Uncial's `Editor`
  itself.
- `uncial-cms/sveltekit` — build-time route factories for prerendered
  SvelteKit sites (`createContentHandlers`, `createEditorHandlers`,
  `createIndexHandlers`).
- `uncial-cms/vite` — `uncialCms(siteOptions)`, the Vite plugins a site
  installs: the development editing endpoint, and the build's forge literal.
- `uncial-cms/paths` — the pure path↔source mapping and the page-path
  validators, with no `node:` module and no `@sveltejs/kit` in the import
  graph, so a plain Node script or a browser bundle can import it.
- `uncial-cms/github` — the GitHub `ForgeAdapter` (`createGitHubAdapter`) over
  the Contents API, plus the two session providers.
- `uncial-cms/local` — the local filesystem `ForgeAdapter`
  (`createLocalAdapter`), its unauthenticated `localSessionProvider`, and
  `createLocalVitePlugin` for the development endpoint.

## Declare the site once

A site's configuration is declared once and **resolved for the current build**
by `defineSite`. Put it in a module with no Svelte and no Kit in its graph, so
that both the app and `vite.config.ts` can read it:

```ts
// site.options.ts
import type { SiteOptions } from 'uncial-cms';

export const STATIC_DIR = 'static';

export const siteOptions: SiteOptions = {
	contentDir: 'content',             // repo-root-relative, as the forge addresses it
	localContentDir: 'content',        // FS path at build time; defaults to contentDir
	mediaDir: `${STATIC_DIR}/uploads`, // repo-root-relative; must sit under the static dir
	github: { repo: 'owner/name', branch: 'main' },
	autosaveMs: 400                    // honoured only when the resolved forge is local
};
```

```ts
// src/lib/site.ts
import { defineSite } from 'uncial-cms';
import { siteOptions } from '../../site.options.js';

export const site = defineSite(siteOptions);
```

The **site object** it returns is `{ config, localOnly, autosaveMs,
localContentDir }`. `config` is an ordinary `UncialCmsSiteConfig`, so every
entry point that took a config still does; the route factories, `EditorPage`
and `mountIndexPage` take the whole object.

- In a **development** build the resolved forge is the local checkout.
- In a **production** build it is GitHub when a `github` half is declared.
- Omit `github` and the site is **local-only**: no forge, and no Editor variant
  in the production build. See [Local-only sites](#local-only-sites).

`authWorkerUrl` and `appSlug` default to the canonical auth worker
(`DEFAULT_AUTH_WORKER_URL`) and the canonical `uncial-cms` GitHub App
(`DEFAULT_APP_SLUG`), so the GitHub half is usually a repository and a branch.
Set them to self-host the worker or run your own App.

`autosaveMs` applies only when the resolved forge is local — on a forge every
keystroke would be a commit — so the same declaration is right in both builds.

## Vite plugins

```ts
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { uncialCms } from 'uncial-cms/vite';
import { siteOptions } from './site.options.js';

export default defineConfig({
	plugins: [...uncialCms(siteOptions), sveltekit()]
});
```

`uncialCms` installs two things: the development-only local editing endpoint,
rooted at the repository and permitting writes under the content directory and
`mediaDir`; and a `define` of the forge the build targets, which is how a
local-only production build drops the editor stack statically rather than merely
leaving it unrouted.

`createLocalVitePlugin` from `uncial-cms/local` is the same endpoint on its own,
for a site that is not using `defineSite`; it takes the repository `root` and the
repo-root-relative `permittedRoots` writes are confined to. It is serve-only and
forces Vite to bind to `127.0.0.1`. Every path it takes is repo-root-relative,
exactly as the GitHub adapter addresses one. The adapter calls it at the fixed,
development-only JSON endpoint `/__uncial-cms/local`:

- `POST /files/<path>` with `{}` reads a document and returns
  `{ content, sha }`.
- `PUT /files/<path>` with `{ content }` writes UTF-8 text and returns
  `{ sha, commitSha }`. Binary writes use `{ content, encoding: 'base64' }`.
- `DELETE /files/<path>` with `{}` deletes a document.
- `POST /dirs/<path>` with `{}` returns `{ entries }`, where each entry has
  `path` and `type` (`'file'` or `'dir'`).

All requests use `Content-Type: application/json`; contents are capped at
`MAX_CONTENT_BYTES`. The middleware resolves each URL path before checking that
it remains beneath one of the permitted roots, and writes through a temporary file followed
by rename, so a watcher never sees a partial document at its target path.

## Quick start: SvelteKit

Three small route pairs. The factories never register a route — you own the
files, so the routes stay explicit and debuggable. Declare prerendering and
trailing slashes once at the root layout:

```ts
// src/routes/+layout.ts
export const prerender = true;
export const trailingSlash = 'always';
```

Alongside `src/lib/site.ts` above, a module for the blocks, the schema and the
site the routes take:

```ts
// src/routes/site.ts
import { createBlockRegistry, createSchema } from 'uncial/core';

export { site } from '$lib/site.js';

export const blocks = createBlockRegistry([]);
export const schema = createSchema(blocks, {
	metaFields: { title: { default: 'Untitled page', required: true } }
});
```

**1. Content catch-all** — `src/routes/[...path]/+page.server.ts`. Prerendered,
and shipping no CMS JavaScript:

```ts
import { createContentHandlers } from 'uncial-cms/sveltekit';
import { blocks, schema, site } from '../site.js';

const handlers = createContentHandlers({ site, blocks, schema });

export const entries = handlers.entries; // derived from the content dir
export const load = handlers.load;       // { document, meta, path }
```

**2. Editor variant** — `src/routes/[...path]/edit/+page.server.ts` bakes the
mapping only; the document is always fetched live from the forge, never read
out of the build:

```ts
import { createEditorHandlers } from 'uncial-cms/sveltekit';
import { blocks, schema, site } from '../../site.js';

const handlers = createEditorHandlers({ site, blocks, schema });

export const entries = handlers.entries;
export const load = handlers.load;       // { sourcePath, pagePath }
```

```svelte
<!-- src/routes/[...path]/edit/+page.svelte -->
<script lang="ts">
	import { EditorPage } from 'uncial-cms/svelte';
	import { blocks, schema, site } from '../../site.js';

	let { data } = $props();
</script>

<main>
	<article class="uncial-rich-content">
		<EditorPage {site} {blocks} {schema} sourcePath={data.sourcePath} pagePath={data.pagePath} />
	</article>
</main>
```

Put `EditorPage` where the Content page's `Renderer` sits, inside the same
shell. That is the whole of the parity work: the component renders Uncial's
`Editor` in the **light DOM**, in your tree and your cascade, so every rule your
site sets already applies and none of them has to be restated. It owns the rest
of the editing surface too — the status line with its commit link, the blocking
conflict banner with download/reload/dismiss, seeding the metadata panel from
the loaded document, the Save button under a forge and autosave under the local
one. It imports the editor's chrome stylesheet itself, loads the editor stack
dynamically, and carries the runtime sentinel the CLI gate looks for.

Its props:

| Prop | Type | Notes |
| --- | --- | --- |
| `site` | `Site` | The object from `defineSite`. |
| `sourcePath` | `string` | From the editor route's payload. |
| `pagePath` | `string` | From the editor route's payload. |
| `blocks` | `BlockRegistry` | |
| `schema` | `ContentSchema \| (path: string) => ContentSchema` | |
| `sessionProvider` | `SessionProvider` | Defaults to the provider the resolved forge implies. |
| `attributesPanel` | `'docked' \| 'overlay' \| 'off'` | Default `'overlay'`: the panel costs the document no width. |
| `presentation` | `'card' \| 'bare'` | Default `'bare'`: no surface of the editor's own. |

Pass `devOnly: true` to `createEditorHandlers` for a **GitHub** site that still
wants editing in development only; a local-only site gets that behaviour without
saying so. Kit reports a prerenderable route it never crawled, so a build strict
about that also names the route in `prerender.handleUnseenRoutes`.

**3. Site index** — `src/routes/uncial/+page.server.ts` + `+page.svelte` (OAuth
landing, create/delete, hash-routed fallback editor). The Index page keeps the
plain-DOM mount:

```ts
import { createIndexHandlers } from 'uncial-cms/sveltekit';
import { blocks, schema, site } from '../site.js';

const handlers = createIndexHandlers({ site, blocks, schema });
export const load = handlers.load;
```

```svelte
<!-- src/routes/uncial/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { mountIndexPage } from 'uncial-cms';
	import { blocks, schema, site } from '../site.js';

	let target: HTMLElement;
	onMount(() => {
		const handle = mountIndexPage(target, { config: site.config, blocks, schema, basePath: base });
		return () => handle.destroy();
	});
</script>

<div bind:this={target}></div>
```

When the site is served under a base path (e.g. GitHub Pages project sites at
`/owner/repo/`), pass the framework's base path to `mountIndexPage`
(`basePath`) so live-page links resolve; the default mapping always operates on
**site-relative** paths with the base stripped.

### Excluding non-page files, and a schema per path

A content directory usually holds files that are not pages. Both handlers take
an `exclude` predicate over `{ path, source }`, and `schema` accepts a resolver
as readily as a single schema — so an essay can require metadata a landing page
does not, without instantiating the factories twice:

```ts
const handlers = createContentHandlers({
	site,
	blocks,
	exclude: ({ path }) => path === 'site-settings',
	schema: (path) => (path.startsWith('essays/') ? essaySchema : pageSchema)
});
```

Pass the same resolver to `EditorPage` and to the Content page's renderer, and
one page path means one schema everywhere.

## Local-only sites

Omitting the `github` half is the whole of the configuration for a site edited
only by whoever holds the checkout:

```ts
export const siteOptions: SiteOptions = { contentDir: 'content', autosaveMs: 400 };
```

No App, no allowlist, no worker, no `doctor`. Everything else — the route pairs,
the blocks, the schema, `EditorPage` — is unchanged. `pnpm dev` and `/about/edit/`
edit the checkout through the local endpoint, with autosave and no Save button.

The production build has no Editor variants: the editor routes prerender no
entries, and `EditorPage` gates its dynamic imports on a build-time literal, so
the editor stack is unreachable and the bundler drops it. Assert it with
`assert-clean-pages --local-only`.

## The headless session

`uncial-cms/session` is the same batteries minus the surface, for a React, Vue
or other framework host that renders Uncial's `Editor` itself. It is what
`EditorPage` is built on. Reach it at the subpath rather than through the
package root: the root exports `mountEditorPage` too, and importing that pulls
in the custom element, its shadow-root machinery and the editor's chrome
stylesheet, which a host rendering its own surface neither wants loaded nor
wants arriving after its own corrections to that stylesheet.

```ts
import { createEditorSession } from 'uncial-cms/session';

const controller = createEditorSession({
	config: site.config,
	sourcePath,
	pagePath,
	blocks,
	schema,
	autosaveMs: site.autosaveMs,
	ui: {
		status: (view) => renderStatus(view),          // tone + message + optional commit link
		setDocument: (doc) => seedEditorAndMeta(doc),  // seed metadata from the document, not the schema
		saveEnabled: (enabled) => setSaveEnabled(enabled),
		conflictVisible: (visible) => setConflictVisible(visible)
	}
});

await controller.load();
```

The host hands the session four callbacks and each edit as it happens; the
session owns storage, autosave, deploy-status polling and conflict recovery.
`forgeAdapter(config)` and `defaultSessionProvider(config)` are exported for a
host that wants the pieces directly.

## Plain-HTML / web-component usage

`mountEditorPage` is the door for a host with no component model. It mounts into
any `HTMLElement`, builds a custom element with a shadow root, and pulls in
Uncial's web-components entry itself — no build step and no framework required.
A SvelteKit site should prefer `EditorPage`: the shadow boundary that buys style
isolation costs a framework host every rule the page sets on `body`, which is
where most sites put their type and their ground.

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

It takes the same parity options `EditorPage` does — `attributesPanel:
'overlay'` so the block attributes panel costs the document no width, and
`presentation: 'bare'` so the editor draws no surface of its own — plus
`editorStylesheets`, which defaults to mirroring the host page's stylesheets
into the shadow root. Pass `autosaveMs` to drop the Save button and write the
document that many milliseconds after the last change instead — the mode a local
checkout wants, where the file *is* the document. Changes inside the window
coalesce into one write, and a change arriving mid-write queues a single
follow-up:

```ts
mountEditorPage(target, { config, sourcePath, blocks, schema, autosaveMs: 400 });
```

Leave `autosaveMs` unset on a forge, where every keystroke would become a commit.

## Session providers

Authentication is owned entirely by the session provider — the `sessionProvider`
option on `EditorPage`, `createEditorSession`, `mountEditorPage` and
`mountIndexPage`. It defaults to the provider the resolved forge implies. Two
ship in the box, plus the unauthenticated `localSessionProvider` the local forge
uses:

- **`popupSessionProvider` (default under GitHub).** Opens the auth worker in a
  popup, runs a PKCE dance, and receives a GitHub App installation token
  **scoped to the one configured repository** (~1 hour, contents read/write).
  The user's OAuth token never reaches the browser. Requires `authWorkerUrl` in
  the config and the [`uncial-cms-auth`](../uncial-cms-auth) worker (a canonical
  hosted instance exists; self-hosting is first-class). Tokens live in
  `sessionStorage` per repo; on expiry the popup re-runs, and GitHub skips
  re-consent so renewal is a flash.
- **`patSessionProvider`.** Zero-backend mode: prompts for a fine-grained
  personal access token (contents read/write on the target repo) and validates
  it via `GET /user`. The permanent dev / self-service mode — no worker needed.

```svelte
<script lang="ts">
	import { patSessionProvider } from 'uncial-cms';
	import { EditorPage } from 'uncial-cms/svelte';
</script>

<EditorPage {site} {blocks} {schema} {sourcePath} {pagePath} sessionProvider={patSessionProvider} />
```

## The `uncial-cms` command

The package ships a `bin` with two commands.

```sh
pnpm exec uncial-cms assert-clean-pages [buildDir] [--local-only]
pnpm exec uncial-cms doctor --origin https://example.com [--repo owner/name]
```

**`assert-clean-pages`** is the zero-CMS-JS build gate. It walks every
`index.html` in the build (default `build`), resolves the static import closure
of its scripts, and checks the runtime sentinel: absent from every Content page,
present on every Editor variant, ignored on the Index page. With `--local-only`
it asserts a local-only site's build instead — no Editor variant exists, and no
page's closure carries the sentinel or the editor stack.

**`doctor`** is the provisioning check, run before the first sign-in rather than
learned from it. Through the authenticated `gh` CLI it checks that the GitHub
App is installed on the repository, that `.uncial/cms.json` is committed on the
default branch and lists the site's origin, and that Pages is enabled and serves
that origin — with a custom domain matching it when the origin is not a
`github.io` one. Each failure names the auth worker refusal it would have
produced. `--repo` defaults to the current checkout's repository, `--app-slug`
to `uncial-cms`, and `--branch` to the default branch. A missing `gh` is a clear
message, not a stack trace.

## Reusable deploy workflow

Uncial publishes a `workflow_call` workflow that does pnpm and Node setup, a
frozen install, check, unit tests, the build with the caller's base path, the
clean-pages gate in the caller's mode, upload and deploy to Pages. A consumer's
own workflow names the trigger, the permissions and the call:

```yaml
# .github/workflows/pages.yml
name: Pages
on:
  push: { branches: [main] }
  workflow_dispatch:
permissions: { contents: read, pages: write, id-token: write }
jobs:
  site:
    uses: d-flood/uncial/.github/workflows/static-site.yml@main
    with:
      base-path: /${{ github.event.repository.name }}
```

Permissions are the caller's — a reusable workflow inherits the calling job's
token scopes, so those three must be declared there. `base-path` is exported to
the build as `BASE_PATH`; a Pages *project* site is served under `/<repo>/`,
while a user, organization or custom-domain site is served at the root and needs
no value. The other inputs are seams rather than everyday knobs:
`package-filter` for a monorepo, `build-dir`, `local-only` for the gate's other
mode, `run-unit-tests`, `deploy`, `pre-build`, and `artifact-name` for a caller
that merges several builds into one Pages artifact. This repository's own docs
deploy uses the last two and is the workflow's live exercise.

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

## Media

Single-image upload commits an image straight into the repo and hands the block
back its served path. It is exposed as pure, adapter-injected functions in the
same family as `createPage`/`deletePage`:

```ts
import { uploadAsset, uploadImageAsset, servedUrl, MAX_CONTENT_BYTES } from 'uncial-cms';

// Pure form — inject an adapter (mirrors createPage). Returns the committed path.
const { path, sha, commitSha } = await uploadAsset(
	{ adapter },
	{ bytes, filename: 'diagram.png', contentType: 'image/png' },
	{ mediaDir: 'static/uploads', author: { name, email } }
);
```

From a block, use the editor convenience: it resolves the adapter and author
from the active editor session, and reads `mediaDir` off the site object, so no
block hardcodes a directory. Import it **dynamically**, inside the handler, so
`uncial-cms` never enters a reader page's static import graph:

```ts
const { servedUrl, uploadImageAsset } = await import('uncial-cms');
const result = await uploadImageAsset(file, { site, fit: true });
updateAttributes?.({ src: servedUrl(site, result.path, STATIC_DIR) });
```

- **`fit`.** `true` (or a `FitOptions` object) re-encodes an oversize image to
  WebP at a bounded longest edge, stepping quality and then dimensions down
  until the bytes fit the forge limit — so a photograph off a phone commits
  instead of failing the Contents API cap. An image already under the limit
  passes through untouched. `fitImage` is exported for use on its own.
- **`servedUrl(site, repoPath, staticDir?)`** maps a committed repo-root path
  under the static directory to the site-root-relative URL the built site serves
  it from. It carries **no base path**: a stored `src` must stay correct at
  every `paths.base` the same content is built at, so the site prepends its base
  at render time.
- **Content-addressed.** The committed name is a hash of the bytes plus the
  original extension (`<mediaDir>/<hash>.<ext>`), so re-uploading identical bytes
  reuses the existing file (idempotent create) and distinct images never collide.
- **Size guard.** Files over `MAX_CONTENT_BYTES` (~1 MB, the GitHub Contents API
  limit) reject with a clear, catchable error before any network call — there is
  no git-blobs-API fallback in v1. With `fit`, the re-encode happens first.
- **`mediaDir`** is repo-root-relative and comes from the site options; the
  returned `path` is repo-root-relative too. Until the next redeploy the
  committed copy is not served, so the editor should bridge the gap with a local
  `objectURL` preview.

The `ForgeAdapter`'s `writeFile` accepts `string | Uint8Array`; binary content is
base64-encoded and PUT to the Contents API with the same message/branch/sha
contract as text writes (conflicts still surface as `ConflictError`).

## v1 limitations & roadmap

Deliberately out of scope for v1 (tracked as future design rounds):

- **Single-image upload only.** [Media](#media) commits one image at a time, up
  to the ~1 MB Contents API limit. `fit` downscales to reach it; there are no
  multi-image/galleries, no video, and no >1 MB via the blobs API.
- **No drafts / PR workflows.** Save commits directly to the configured branch.
  Editorial review in v1 is git **branch protection**, configured by the site
  owner. A save-to-branch toggle is a candidate for v1.x.
- **GitHub and local files only.** v1 ships the forge-adapter *interface*
  (validated on paper against GitLab's client-side PKCE), the GitHub
  implementation, and a development-only local filesystem implementation.
  **GitLab** / Gitea adapters are future work; nothing outside the adapter
  assumes a worker exists.
- **No scaffold command.** The per-site remainder is a config module, three
  route pairs, one JSON file and a ten-line workflow; a generator is worth
  writing once more projects have exercised that remainder.

## Development

```sh
pnpm run check              # svelte-check
pnpm run test:unit -- --run # vitest (node)
pnpm run test:e2e           # Playwright: plain-HTML fixture + built demo + base-path demo
pnpm run prepack            # svelte-package → dist, then publint
```
