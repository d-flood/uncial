---
'uncial-cms': patch
---

The local forge addresses repo-root paths, as every forge adapter's interface
already said it did. `writeFile` took a repo-root path on GitHub but a
content-directory-relative one locally, so an image uploaded in the editor under
`vite dev` was written inside the content tree — `<contentDir>/<mediaDir>/…`
rather than `<mediaDir>/…` — and the URL the block stored resolved to nothing.

The development plugin now resolves against the repository root and confines
writes to the directories the site declares: the content directory, and
`mediaDir` when one is set. A path outside them is refused. `uncialCms()` passes
`mediaDir` through, so a site that sets one needs no further configuration.

`createLocalVitePlugin` takes `{ root, permittedRoots }` in place of
`{ contentDir }` for this. Its request-body cap now admits the base64 envelope of
a maximum-size payload, which is the size the image fitter targets; the decoded
cap still enforces the limit, so an image fitted to just under the ceiling is no
longer rejected by the path that exists to make it fit.
