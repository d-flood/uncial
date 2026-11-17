# Uncial

The Uncial product family: a backend-agnostic Tiptap block editor and SSR
renderer (`uncial`), a git-forge-backed CMS built on it (`uncial-cms`), a
stateless auth worker that mints repo-scoped tokens (`uncial-cms-auth`), and —
as of the docs-as-CMS effort — a dogfooding docs site (`uncial-docs`) whose real
documentation content is managed through the CMS.

## Language

**Block**:
A reusable content unit defined once as a framework component, declared with
`defineBlock` in that component's `<script module>`, then used in both the editor
and the SSR renderer. Its explicit id, not its file name, names it in stored
documents. Atomic, or a container with one default child content region.
_Avoid_: Widget, component (when you mean a Block), shortcode

**Mark**:
Inline formatting on a run of text, such as bold or a link. A custom Mark is
declared once with `defineMark` (its lazy editor extension, reader component and
optional toolbar button) and listed in the Content model's `marks`, which
registers it on every editing surface and in the Renderer.
_Avoid_: Format, style, decoration, inline block

**Content model**:
What `createContentModel` returns: the Blocks (usually one `import.meta.glob` of
Block components), the Page templates, the Marks, the meta fields every page
has, the base path and the editor options, declared once and handed to `Editor`,
`Renderer`, `Page` and the web components as `model`.
_Avoid_: Registry (when you mean the whole model), schema, block config

**Page template**:
A Svelte component, declared with `defineTemplate` in its `<script module>` and
registered in the Content model by glob, that draws a Content page's shell
(banner, title, navigation, layout) from its metadata and route data. A
document's `template` metadata value names it. `Page` draws it around the
Renderer and `Editor` around the live editing surface, so authors edit inside
the page readers get. It never reads the document body.
_Avoid_: Layout (SvelteKit's), shell, theme

**Block context**:
What `getBlock()` gives a Block component: whether it is being edited, its live
attributes, `update` and the Media source while editing, and where it sits
(parent Block, index, siblings, and the page's path, template and meta). It is
the same in the Renderer and the editor except `editing`, so a container's
children read `parent` rather than Svelte context set by an ancestor Block.
_Avoid_: `updateAttributes`, editing flag, block props (when you mean the context)

**Field component**:
`Text`, `RichText` or `Image`, placed in a Block or a Page template and naming one
field: the Block's attribute inside a Block, the page's metadata in a template
outside its body. It renders plain output for readers and is edited in place in
the editor, committing as the attributes or metadata panel would.
_Avoid_: Inline editor, editable, field (when you mean the component)

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
The hash-routed editor (`#/edit/<path>`) served from the Dashboard for a page
that has no prerendered Editor variant yet (e.g. a just-created page before
redeploy).
_Avoid_: Generic editor

**Index page**:
The Dashboard's Pages section, which lists, searches, creates and deletes
Content documents and opens each in its Editor variant or the Fallback editor.
_Avoid_: Admin home

**Dashboard**:
The `/uncial/` signed-in area itself, rendered by the `Dashboard` component or
`<uncial-dashboard>`, with sections Pages, Media, Globals, one per Collection,
and App sections.
_Avoid_: Admin, back office

**App section**:
A host-supplied Dashboard section, either slotted (the host's own markup shown
in the frame) or linked (a nav link to a host route).
_Avoid_: Plugin, extension, custom section

**Draft**:
The working copy of a Content document, unseen by the public. A Content document has at most one.
_Avoid_: Revision, unsaved changes

**Published copy**:
The copy of a Content document the public sees.
_Avoid_: Live version, current version

**Version**:
A former Published copy, kept so it can be restored. One is created every time a Draft is published.
_Avoid_: Revision, backup, snapshot

**Retention policy**:
The rule deciding how long Versions are kept, either a number of Versions or a number of days. It never removes a Published copy or a Draft.
_Avoid_: Backup schedule

**Site config**:
The per-site record (`UncialCmsSiteConfig`) baked at build time naming the
forge, repo, branch, content dir and sign-in, resolved from the site options.
_Avoid_: Settings, options

**Site object**:
Site config plus Content model: what `defineSite(siteOptions, model)` returns. It
holds the Site config resolved for the current build as `config`, and resolves the
session provider, Media source and file source from it, `staticDir` and `base`.
Server-safe. The one thing every editing surface is handed.
_Avoid_: Site, config object

**Global**:
A named Content document with meta fields only, holding site-wide data such as
menus or a banner. Declared in site options as a meta-field record
(`globals: { name: { label, meta } }`), edited in the Dashboard's Globals
section, published on every save, read with `loadGlobal`, and kept under
`_globals/`, which is never a page.
_Avoid_: Settings (reserved by Site config), site data

**Collection**:
A named set of meta-only Content documents, such as states or people. Declared
in site options with a repo-root-relative `dir`, a `label` and its `meta` fields;
each record is `<dir>/<slug>.json` (a path prefix in the store on a server
forge). Edited in its own Dashboard section, read with `loadCollection`, and
never a Content page.
_Avoid_: Data directory, records, dataset

**Media source**:
Where media is read and written: the Media library on a server forge, the
`mediaDir` on a git forge. The Dashboard's Media section reads it as a
`MediaSource`, whose capabilities say whether it has metadata, usage, delete and
search. The editor's picker, `site.media` and `getBlock().media` read it as an
`ImageSource` (upload, browse, thumbnail), which a site may override.
_Avoid_: Media adapter, media store

**Local-only site**:
A site declaring no GitHub half, so it has no forge to commit to and its Editor
variants exist in development only — absent, with the whole editor stack, from
the production build.
_Avoid_: Dev-only site, offline site

**Editor page component**:
`EditorPage` from `uncial-cms/svelte`: the recommended door onto an Editor
variant in a SvelteKit site. Renders the editor in the light DOM, in the host's
own cascade, and owns the status line, conflict banner, metadata seeding and
autosave. The `<uncial-editor-page>` custom element from `uncial-cms/elements`
is the door for hosts without Svelte.
_Avoid_: Editor component, EditorPage wrapper

**Allowlist**:
The in-repo `.uncial/cms.json` file, read by the auth worker, that authorizes
editor origins for a repo. Origin-keyed, not per-site.
_Avoid_: Whitelist, config

**Docs page**:
One of the grouped CMS-managed documentation Content documents in `uncial-docs`
(getting-started, blocks, rendering, static-site, upgrading, …).
_Avoid_: Doc, article, chapter

**Callout block**:
A custom Block used in the docs for note/warning/tip admonitions — the canonical
`defineBlock` showcase.
_Avoid_: Admonition, alert, aside

**Image block**:
A custom Block used in the docs to place a screenshot/figure, drawn with the
`Image` and `Text` Field components, so it uploads through the Site object's
Media source.
_Avoid_: Figure, media, upload

**Table of contents (TOC)**:
The navigation generated at render time from a Content document's headings; not
stored in the document.
_Avoid_: Outline, nav (when you mean the in-page TOC)
