---
'uncial': minor
---

Add `resolveImageSrc(src, base)` to `uncial/render`, which applies the site's base path to a root-relative image `src` and leaves `blob:` previews, `data:` URIs and absolute URLs untouched.
