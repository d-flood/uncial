---
'uncial-cms': minor
---

Add a basic single-image upload capability, reversing the former "no media upload" non-goal. New public `uploadAsset(deps, file, opts)` commits an image into the repo at a content-addressed path (`<mediaDir>/<hash>.<ext>`) so identical bytes reuse the existing file and never collide; files over the Contents API limit (~1 MB) reject with a clear error. `uploadImageAsset(file, opts)` is an editor-facing convenience that resolves the adapter/author from the active editor session. The `ForgeAdapter` gains binary `writeFile` support (base64-encoded PUT to the Contents API, same conflict/sha semantics as text). `UncialCmsSiteConfig` gains an optional `mediaDir` field.
