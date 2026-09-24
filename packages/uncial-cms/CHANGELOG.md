# uncial-cms

## 4.0.1

### Patch Changes

- 475aa3e: The site index shows a Sign in button when sign-in fails, so a sign-in popup the browser blocked on page load can be retried from a click.

## 4.0.0

### Minor Changes

- e46d0e0: Add `input: 'image'` field with upload and Choose existing, `cmsImageSource`, and `resolveImageSrc`; GitHub `listDir` handles large directories.

### Patch Changes

- Updated dependencies [e46d0e0]
  - uncial@4.0.0

## 3.1.0

### Minor Changes

- 6856fc5: Support Astro hosts. `uncial-cms/astro` adds the `uncialCms` integration, which installs the dev server's local forge, and `createContentRoutes` / `createEditorRoutes`, which hand a host's own `[...path].astro` routes their `getStaticPaths`. `uncial-cms/astro/editor` adds `EditorSurface`, the editor island over the headless session, which forwards Tiptap extensions and toolbar controls to `Editor`. `uncial-cms assert-clean-pages --astro` gates an Astro build's reader pages against Astro's asset layout.

## 3.0.1

### Patch Changes

- 4983361: Stop declaring `@sveltejs/kit` as an optional peer, which made `npm install uncial-cms` fail with ERESOLVE in non-SvelteKit hosts on an older Vite major (e.g. Astro 5).

## 3.0.0

### Minor Changes

- 7ce3190: Configurable deploy-status polling timings via `defineSite({ deployStatus })`, and `doctor --no-pages` for sites not on GitHub Pages.

### Patch Changes

- Updated dependencies [76f93bd]
  - uncial@3.0.0

## 2.0.2

### Patch Changes

- 3a9e497: Read a commit's check runs as well as its statuses when polling a deploy.

## 2.0.1

### Patch Changes

- c789496: Export the stylesheets under extension-bearing subpaths (`uncial/styles/chrome.css`, `uncial/styles/index.css`, …) alongside the bare ones, and import `uncial/styles/chrome.css` from `mountEditorPage` and `EditorPage`. Vite's dependency optimizer only routes a stylesheet through its CSS pipeline when the import specifier itself ends in `.css`; with the bare subpath, a host that pre-bundles `uncial-cms` had the editor chrome bundled into a sidecar file that never loaded, leaving the toolbar unstyled in development.

  The editor toolbar is now sticky to the top of the screen, and reordering nested blocks by dragging in the attributes panel works inside the `<uncial-editor>` web component: the drop target is hit-tested from the panel's own shadow root, where `document.elementFromPoint` only ever returned the host element.

- Updated dependencies [c789496]
  - uncial@2.0.1

## 2.0.0

### Minor Changes

- fba726b: Let a host render the editor in the document's published layout. The editor
  previously took inline space from the document for its own affordances — the
  attributes panel held a grid column and the block gutter was reserved as padding
  inside `.uncial-content` — so any host CSS deriving a width from the container
  (full-bleed bands, a prose measure, container queries) computed a different
  width under the editor than on the rendered page.

  `Editor` (and `<uncial-editor>`) gain `presentation: 'card' | 'bare'` and widen
  `attributesPanel` to `boolean | 'docked' | 'overlay' | 'off'`. Under
  `presentation="bare"` the shell draws no surface of its own and reserves no
  padding, so `.uncial-content`'s content box is exactly the box the host gave the
  shell, and the block handles float over each block's top-left corner instead of
  pushing it inwards — which also keeps them on screen for a block that bleeds
  past the document column. `attributesPanel="overlay"` floats the panel against
  the viewport edge while a block is selected, costing the document no width;
  selection no longer auto-opens it in that mode (the block's gutter label does),
  and it carries a Close button. Defaults are unchanged. `bindEditor` gains the
  matching `autoOpenAttributes` option, and `mountEditorPage` forwards both
  settings.

- 3ac9918: The local forge now behaves like the forge its adapter interface describes. A
  write carrying a `sha` is refused with a conflict when the file on disk has
  moved on, so an editor autosaving against the checkout raises the same blocking
  banner — download, reload, dismiss — that a 409 from GitHub raises, instead of
  silently overwriting an edit made underneath it. A write with no `sha` still
  creates or replaces outright.

  The development plugin also stops watching its own content directory. Every
  write there arrives through the plugin's own endpoint, so the watcher only ever
  saw the author's own autosave landing — and answered it with a full page reload
  that took the editing session with it.

  Uncial's token defaults move into a `uncial-tokens` cascade layer, so a host's
  own `--uncial-*` values win however the stylesheets end up ordered. `EditorPage`
  imports the chrome stylesheet at runtime, which lands after the host's CSS;
  unlayered, those defaults were taking the host's typography back at the moment
  the editor mounted.

- 56fe486: The zero-CMS-JS build gate is now a command the package ships rather than a
  script each site copies. `uncial-cms assert-clean-pages [buildDir]` walks every
  page in a build, resolves its scripts' static import closure and asserts that
  Content pages carry none of this package's JavaScript while every Editor variant
  carries it, with the same OK and FAILED output the copied scripts printed.
  `--local-only` asserts the other gating philosophy in the same command: a
  local-only site's production build must contain no Editor variant at all, and no
  file anywhere in it may carry the runtime sentinel or the editor stack —
  `tiptap`, the `ProseMirror-` class prefix, `uncial-editor`. `--help` prints
  usage and an unknown command exits 2.

  Two changes make a local-only build actually pass that: the package declares
  itself side-effect free, so importing `defineSite` no longer drags the editor
  mount and its custom elements into the bundle, and `EditorPage` marks its
  runtime sentinel behind the same gate it loads the editor behind, so a
  local-only production build drops the sentinel with the rest of the stack. An
  Editor variant under a forge is unchanged — it still carries the sentinel the
  gate looks for.

- 47b0102: Declare a site's configuration once and let the package resolve it. `defineSite`
  (package root) takes the content directory and an optional GitHub half and
  returns the site object every entry point already understands: the local forge
  while developing, the declared GitHub forge in a production build, and a
  local-only site — `localOnly: true`, local forge, nothing thrown — when no
  GitHub half is declared, so "no forge" stops being a mode to gate for by hand.
  The canonical auth worker and GitHub App are the defaults, exported as
  `DEFAULT_AUTH_WORKER_URL` and `DEFAULT_APP_SLUG`, leaving the GitHub half a
  repository and a branch. A new `uncial-cms/vite` subpath exports `uncialCms`,
  which installs the local file plugin and defines
  `import.meta.env.UNCIAL_CMS_FORGE` as the forge the build targets, so an editor
  page can gate on a string literal Rollup can fold away.

  The SvelteKit route factories tighten to match. `blocks` and `schema` are typed
  (`BlockRegistry`, `ContentSchema`) instead of `unknown`; `schema` also accepts a
  `(path) => ContentSchema` resolver, so an essay can require metadata a landing
  page does not without a second set of factories. A new `exclude` predicate keeps
  non-page files — a settings document, a manifest — out of `entries()` and
  refuses to load them. All three factories accept the site object in place of
  `config` and `localContentDir`, and a local-only site's editor variants
  prerender nothing without `devOnly`. **Breaking for the payload keys:** the
  content `load` now returns `path`, so a site can stop re-spreading it, and the
  editor `load` returns `pagePath` rather than `path`, which collided with the key
  a layout already uses for the current page.

- 8d0d443: `uncial-cms doctor --origin <https://host>` checks the provisioning a site owner
  would otherwise learn about from a failed sign-in. Through the authenticated
  `gh` CLI it reports whether the GitHub App is installed on the repository,
  whether you have push permission on it, whether `.uncial/cms.json` is committed
  on the default branch and lists the origin exactly, and whether Pages is enabled
  — with the custom domain matching the origin's host and HTTPS enforced when the
  origin is not a `github.io` one. Every check runs and prints its own ✓/✗ line, a
  failure names the auth worker refusal it would have produced
  (`app_not_installed`, `no_push_permission`, `missing_allowlist`,
  `origin_not_allowed`) alongside the fix, and a `github.io` origin draws a
  warning that allowlisting a shared origin authorises every project page served
  from it. Where GitHub answers the App-installation route only to a token
  authorized to a GitHub App — which a `gh auth login` token is not — that one
  check warns and names the install page to check by eye, rather than reporting an
  installation you have as missing. `--repo` defaults to the current checkout, `--app-slug` to the
  canonical app and `--branch` to the repository's default branch. The command
  exits 0 only when everything passes, 1 when a check fails, and 2 when `gh` is
  missing or unauthenticated — one instruction, no stack trace. It replaces the
  shell provisioning wizard one consumer carried; DNS and HTTPS reachability
  probes stay in the docs checklist.
- 1481a91: Uploads that fit, and land where the site serves them. `uploadImageAsset` takes
  a `fit` option — `true` for the defaults, or `{ maxBytes, maxEdge }` — that
  re-encodes an oversize image to WebP within a bounded longest edge, stepping
  quality and then dimensions down until the bytes clear the forge's limit, so a
  photograph off a phone commits instead of failing the Contents API cap; the
  descent is also exported on its own as `fitImage`, with the decode/encode seam
  injectable. Both upload helpers now default `mediaDir` from a `site` passed
  alongside the file (and `uploadImageAsset` from the active editor session's
  config), and `uploadImageAsset` accepts a picked `File` directly. A new
  `servedUrl(site, repoPath, staticDir?)` maps a committed repo-root path under
  the site's static directory to the site-root-relative URL the built site serves
  it from, leaving the base path to be applied at render time, so no block
  hardcodes a media directory or strips a prefix by hand.
- e88410a: Add the framework-independent `uncial-cms/paths` entrypoint for URL-to-source mapping and page-path helpers, and export Content document parsing and serialization from the package root for use in Node scripts and migrations.
- 8d7dbf1: A SvelteKit site now reaches its Editor variants through one component instead
  of a shadow root. The new `uncial-cms/svelte` subpath exports `EditorPage`,
  which renders Uncial's `Editor` in the host's own tree and cascade and owns the
  whole editing surface `mountEditorPage` owns: the status line with its commit
  link, the blocking conflict banner with download, reload and dismiss, metadata
  seeded from the loaded document rather than from schema defaults, a Save button
  under a forge, and debounced autosave with no Save button when the site sets
  `autosaveMs`. It takes the object `defineSite` returns plus the two paths the
  editor route's payload carries, loads the editor stack and the headless session
  dynamically, and returns before importing anything when a local-only site is
  built for production, so a reader of that build downloads no editor code. The
  shadow-root mount and `createEditorSession` are unchanged and remain the door
  for hosts without Svelte.

  The editor's chrome stops switching palette on the operating system's preference
  alone. Uncial's chrome tokens carry both palettes through `light-dark()` on one
  selector list, so the editor follows the `color-scheme` its host declares — a
  site with a theme toggle no longer shows a dark editor on a light page — and a
  host that declares nothing gets the light palette. Site-set `--uncial-*`
  overrides keep winning.

### Patch Changes

- 8eccada: The local forge addresses repo-root paths, as every forge adapter's interface
  already said it did. `writeFile` took a repo-root path on GitHub but a
  content-directory-relative one locally, so an image uploaded in the editor under
  `vite dev` was written inside the content tree — `<contentDir>/<mediaDir>/…`
  rather than `<mediaDir>/…` — and the URL the block stored resolved to nothing.

  The development plugin now resolves against the repository root and confines
  writes to the directories the site declares: the content directory, and
  `mediaDir` when one is set. A path outside them is refused. `uncialCms()` passes
  `mediaDir` through, so a site that sets one needs no further configuration.

  `createLocalVitePlugin` takes `{ root, permittedRoots }` in place of
  `{ contentDir }` for this. Its request-body cap now admits the base64 envelope of
  a maximum-size payload, which is the size the image fitter targets; the decoded
  cap still enforces the limit, so an image fitted to just under the ceiling is no
  longer rejected by the path that exists to make it fit.

- Updated dependencies [fba726b]
- Updated dependencies [fba726b]
- Updated dependencies [3ac9918]
- Updated dependencies [8d7dbf1]
  - uncial@2.0.0

## 1.0.0

### Minor Changes

- 03f7bdd: Add a basic single-image upload capability, reversing the former "no media upload" non-goal. New public `uploadAsset(deps, file, opts)` commits an image into the repo at a content-addressed path (`<mediaDir>/<hash>.<ext>`) so identical bytes reuse the existing file and never collide; files over the Contents API limit (~1 MB) reject with a clear error. `uploadImageAsset(file, opts)` is an editor-facing convenience that resolves the adapter/author from the active editor session. The `ForgeAdapter` gains binary `writeFile` support (base64-encoded PUT to the Contents API, same conflict/sha semantics as text). `UncialCmsSiteConfig` gains an optional `mediaDir` field.
- 5a38e4a: Initial release of uncial-cms — a git-forge-backed static CMS where the site's git repository is the single source of truth. Every content page gets a generated editor variant plus a `/uncial/` site index; editors sign in with GitHub and save edits as direct commits with sha-based conflict detection. Ships the framework-agnostic browser runtime (`mountEditorPage`/`mountIndexPage`, create/delete, fallback editor), the GitHub forge adapter, popup and PAT session providers, and SvelteKit route factories.

  Initial release of `uncial-cms-auth` — the stateless Cloudflare Worker that turns a GitHub OAuth sign-in into a single-repo-scoped GitHub App installation token, gated by a push-permission check and an in-repo `.uncial/cms.json` origin allowlist. Published as source; deploy with `wrangler`.

### Patch Changes

- Updated dependencies [c9f709a]
  - uncial@1.0.0
