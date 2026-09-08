---
'uncial-cms': minor
---

Uploads that fit, and land where the site serves them. `uploadImageAsset` takes
a `fit` option — `true` for the defaults, or `{ maxBytes, maxEdge }` — that
re-encodes an oversize image to WebP within a bounded longest edge, stepping
quality and then dimensions down until the bytes clear the forge's limit, so a
photograph off a phone commits instead of failing the Contents API cap; the
descent is also exported on its own as `fitImage`, with the decode/encode seam
injectable. Both upload helpers now default `mediaDir` from a `site` passed
alongside the file (and `uploadImageAsset` from the active editor session's
config), and `uploadImageAsset` accepts a picked `File` directly. A new
`servedUrl(site, repoPath, staticDir?)` maps a committed repo-root path under
the site's static directory to the site-root-relative URL the built site serves
it from, leaving the base path to be applied at render time, so no block
hardcodes a media directory or strips a prefix by hand.
