---
'uncial': minor
'uncial-cms': minor
---

The local forge now behaves like the forge its adapter interface describes. A
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
