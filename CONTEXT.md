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
The per-site record (`siteConfig`) baked at build time naming the forge, repo,
branch, content dir, auth worker URL, and app slug.
_Avoid_: Settings, options

**Allowlist**:
The in-repo `.uncial/cms.json` file, read by the auth worker, that authorizes
editor origins for a repo. Origin-keyed, not per-site.
_Avoid_: Whitelist, config

**Docs page**:
One of the ~4–5 grouped CMS-managed documentation Content documents in
`uncial-docs` (getting-started, blocks, rendering, advanced, …).
_Avoid_: Doc, article, chapter

**Callout block**:
A custom Block used in the docs for note/warning/tip admonitions — the canonical
`defineSvelteBlock` showcase.
_Avoid_: Admonition, alert, aside

**Image block**:
A custom Block used in the docs to place a screenshot/figure by referencing a
committed static asset path (no media upload — see the CMS media non-goal).
_Avoid_: Figure, media, upload

**Table of contents (TOC)**:
The navigation generated at render time from a Content document's headings; not
stored in the document.
_Avoid_: Outline, nav (when you mean the in-page TOC)
