---
'uncial': patch
'uncial-cms': patch
---

Export the stylesheets under extension-bearing subpaths (`uncial/styles/chrome.css`, `uncial/styles/index.css`, …) alongside the bare ones, and import `uncial/styles/chrome.css` from `mountEditorPage` and `EditorPage`. Vite's dependency optimizer only routes a stylesheet through its CSS pipeline when the import specifier itself ends in `.css`; with the bare subpath, a host that pre-bundles `uncial-cms` had the editor chrome bundled into a sidecar file that never loaded, leaving the toolbar unstyled in development.

The editor toolbar is now sticky to the top of the screen, and reordering nested blocks by dragging in the attributes panel works inside the `<uncial-editor>` web component: the drop target is hit-tested from the panel's own shadow root, where `document.elementFromPoint` only ever returned the host element.

