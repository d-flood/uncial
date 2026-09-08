---
'uncial-cms': minor
---

The zero-CMS-JS build gate is now a command the package ships rather than a
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
