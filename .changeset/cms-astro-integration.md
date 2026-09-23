---
'uncial-cms': minor
---

Support Astro hosts. `uncial-cms/astro` adds the `uncialCms` integration, which installs the dev server's local forge, and `createContentRoutes` / `createEditorRoutes`, which hand a host's own `[...path].astro` routes their `getStaticPaths`. `uncial-cms/astro/editor` adds `EditorSurface`, the editor island over the headless session, which forwards Tiptap extensions and toolbar controls to `Editor`. `uncial-cms assert-clean-pages --astro` gates an Astro build's reader pages against Astro's asset layout.
