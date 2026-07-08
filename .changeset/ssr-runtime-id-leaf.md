---
'uncial': minor
'uncial-wagtail': minor
---

Polish the editor and core runtime: live attribute edits now validate per-field, metadata support is available on `<uncial-editor>`, and browser-only editor code stays out of SSR imports.

Also tightens attribute defaults/schema guards, improves editor accessibility and Wagtail admin layout, and replaces global chooser events with scoped callbacks.
