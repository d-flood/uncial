---
'uncial-cms': minor
---

Declare a site's configuration once and let the package resolve it. `defineSite`
(package root) takes the content directory and an optional GitHub half and
returns the site object every entry point already understands: the local forge
while developing, the declared GitHub forge in a production build, and a
local-only site — `localOnly: true`, local forge, nothing thrown — when no
GitHub half is declared, so "no forge" stops being a mode to gate for by hand.
The canonical auth worker and GitHub App are the defaults, exported as
`DEFAULT_AUTH_WORKER_URL` and `DEFAULT_APP_SLUG`, leaving the GitHub half a
repository and a branch. A new `uncial-cms/vite` subpath exports `uncialCms`,
which installs the local file plugin and defines
`import.meta.env.UNCIAL_CMS_FORGE` as the forge the build targets, so an editor
page can gate on a string literal Rollup can fold away.

The SvelteKit route factories tighten to match. `blocks` and `schema` are typed
(`BlockRegistry`, `ContentSchema`) instead of `unknown`; `schema` also accepts a
`(path) => ContentSchema` resolver, so an essay can require metadata a landing
page does not without a second set of factories. A new `exclude` predicate keeps
non-page files — a settings document, a manifest — out of `entries()` and
refuses to load them. All three factories accept the site object in place of
`config` and `localContentDir`, and a local-only site's editor variants
prerender nothing without `devOnly`. **Breaking for the payload keys:** the
content `load` now returns `path`, so a site can stop re-spreading it, and the
editor `load` returns `pagePath` rather than `path`, which collided with the key
a layout already uses for the current page.
