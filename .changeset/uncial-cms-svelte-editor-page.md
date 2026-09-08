---
'uncial': minor
'uncial-cms': minor
---

A SvelteKit site now reaches its Editor variants through one component instead
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
