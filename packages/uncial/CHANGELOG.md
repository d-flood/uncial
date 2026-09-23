# uncial

## 3.0.0

### Minor Changes

- 76f93bd: Add `createMarkRegistry` and a `Renderer` `marks` prop so custom inline marks render server-side.

## 2.0.3

## 2.0.2

### Patch Changes

- 1d27c39: Fix a block's inline editing UI writing to the wrong block, or silently doing nothing, unless that block was selected.

  The `updateAttributes` prop handed to every block component wrote to whichever node the editor's selection happened to sit in, not to the block that called it. A block's own controls — captions, pickers, reorder and remove buttons — therefore edited a different block, or reported success and changed nothing, unless the reader had first clicked that block's gutter label. Blocks that sit first in a document appeared to work, because the first node is selected on load.

  `updateAttributes` now addresses the calling block by its position and merges the given keys over the attributes it currently has, so a block's inline UI works wherever the block sits and whatever the reader last clicked. It still does not move the selection or focus the editor, so form controls inside a block keep focus while you type. No API change: the prop's signature and merge semantics are unchanged, and consumers need no edits.

## 2.0.1

### Patch Changes

- c789496: Export the stylesheets under extension-bearing subpaths (`uncial/styles/chrome.css`, `uncial/styles/index.css`, …) alongside the bare ones, and import `uncial/styles/chrome.css` from `mountEditorPage` and `EditorPage`. Vite's dependency optimizer only routes a stylesheet through its CSS pipeline when the import specifier itself ends in `.css`; with the bare subpath, a host that pre-bundles `uncial-cms` had the editor chrome bundled into a sidecar file that never loaded, leaving the toolbar unstyled in development.

  The editor toolbar is now sticky to the top of the screen, and reordering nested blocks by dragging in the attributes panel works inside the `<uncial-editor>` web component: the drop target is hit-tested from the panel's own shadow root, where `document.elementFromPoint` only ever returned the host element.

## 2.0.0

### Minor Changes

- fba726b: Add `list`, an attribute input for array-valued attributes. Declaring
  `list: { fields: { label: '', value: '' } }` (records) or
  `list: { value: { default: '', options } }` (single values) renders the
  attribute in the panel as one control per item with add, remove and reorder,
  instead of the raw JSON textarea that `input: 'json'` falls back to — an
  attribute an author can only edit by typing valid JSON is not editable by the
  people a CMS is for. The stored value is unchanged: it is the same array, so
  adopting `list` needs no content migration and keeps the attribute's existing
  `validate`. `defineBlock` rejects a `list` that declares neither `fields` nor
  `value`, since there would be no field to render.

  Also: a block's rendered output no longer lags its attributes. Attribute edits
  reach the node view inside `view.dispatch`, itself inside the event handler that
  made the edit, and a prop written to a separately mounted component in that
  window does not reach it — the block kept rendering its old attributes until
  something else re-rendered it, so an author editing a headline saw nothing
  change. The node view now queues that prop update onto a microtask, outside the
  dispatch window and still before paint.

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

## 1.0.0

### Minor Changes

- c9f709a: Polish the editor and core runtime: live attribute edits now validate per-field, metadata support is available on `<uncial-editor>`, and browser-only editor code stays out of SSR imports.

  Also tightens attribute defaults/schema guards, improves editor accessibility and Wagtail admin layout, and replaces global chooser events with scoped callbacks.

## 0.0.7

### Patch Changes

- 8849aa9: remove tailwind and daisyui from core editor and make core editor themable
- 926bc45: Add editable metadata to pm document; improve wagtail integration and demo

## 0.0.6

### Patch Changes

- 89eb04f: Add top level readme and umami script to demo/docs

## 0.0.5

### Patch Changes

- 05dc82a: Restructure repo to prepare for a mono repo and add a barely-working django wagtail package

## 0.0.4

### Patch Changes

- 5314d08: Add screen recording to readme

## 0.0.3

### Patch Changes

- a30d587: Add screenshot and linkis to readme

## 0.0.2

### Patch Changes

- 8378c6a: Prepare Uncial for public npm releases with Changesets, provenance publishing, and a separate static demo/docs build for GitHub Pages.
