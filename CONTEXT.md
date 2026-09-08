# Uncial

The Uncial product family: a backend-agnostic Tiptap block editor and SSR
renderer (`uncial`), a git-forge-backed CMS built on it (`uncial-cms`), a
stateless auth worker that mints repo-scoped tokens (`uncial-cms-auth`), and —
as of the docs-as-CMS effort — a dogfooding docs site (`uncial-docs`) whose real
documentation content is managed through the CMS.

## Language

**Block**:
A reusable content unit defined once as a framework component and registered via
`defineSvelteBlock`, then used in both the editor and the SSR renderer. Atomic,
or a container with one default child content region.
_Avoid_: Widget, component (when you mean a Block), shortcode

**Content document**:
The normalized, version-stamped JSON that represents one editable page's body
and metadata. Stored as a `*.json` file under a site's content dir.
_Avoid_: Post, entry, record

**Content page**:
A production, reader-facing page rendered from a Content document by the SSR
renderer. Ships **no** editor JS.
_Avoid_: Public page, live page

**Editor variant**:
The generated `.../edit/` route paired with a Content page, where that page's
Content document is edited in the WYSIWYG editor. Carries the editor JS
(the "sentinel").
_Avoid_: Edit page, admin page

**Fallback editor**:
The hash-routed editor served from the index for a page that has no prerendered
Editor variant yet (e.g. a just-created page before redeploy).
_Avoid_: Generic editor

**Index page**:
The `/uncial/` (CMS) landing that lists Content documents in a content dir and
hosts create/delete plus the Fallback editor.
_Avoid_: Dashboard, admin home

**Site config**:
The per-site record (`UncialCmsSiteConfig`) baked at build time naming the
forge, repo, branch, content dir, auth worker URL, and app slug.
_Avoid_: Settings, options

**Site object**:
What `defineSite(siteOptions)` returns: the Site config resolved for the current
build, plus `localOnly`, `autosaveMs` and `localContentDir`. The thing the route
factories, the Editor page component and the index mount are handed.
_Avoid_: Site, config object

**Local-only site**:
A site declaring no GitHub half, so it has no forge to commit to and its Editor
variants exist in development only — absent, with the whole editor stack, from
the production build.
_Avoid_: Dev-only site, offline site

**Editor page component**:
`EditorPage` from `uncial-cms/svelte`: the recommended door onto an Editor
variant in a SvelteKit site. Renders the editor in the light DOM, in the host's
own cascade, and owns the status line, conflict banner, metadata seeding and
autosave. The shadow-root `mountEditorPage` remains the door for hosts without
Svelte.
_Avoid_: Editor component, EditorPage wrapper

**Allowlist**:
The in-repo `.uncial/cms.json` file, read by the auth worker, that authorizes
editor origins for a repo. Origin-keyed, not per-site.
_Avoid_: Whitelist, config

**Docs page**:
One of the grouped CMS-managed documentation Content documents in `uncial-docs`
(getting-started, blocks, rendering, integrations, static-site, …).
_Avoid_: Doc, article, chapter

**Callout block**:
A custom Block used in the docs for note/warning/tip admonitions — the canonical
`defineSvelteBlock` showcase.
_Avoid_: Admonition, alert, aside

**Image block**:
A custom Block used in the docs to place a screenshot/figure. Its editor
affordance uploads a file through `uploadImageAsset`, commits it under the
site's media dir, and stores the `servedUrl` as `src`.
_Avoid_: Figure, media, upload

**Table of contents (TOC)**:
The navigation generated at render time from a Content document's headings; not
stored in the document.
_Avoid_: Outline, nav (when you mean the in-page TOC)
