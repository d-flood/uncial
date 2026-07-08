---
'uncial-cms': minor
'uncial-cms-auth': minor
---

Initial release of uncial-cms — a git-forge-backed static CMS where the site's git repository is the single source of truth. Every content page gets a generated editor variant plus a `/uncial/` site index; editors sign in with GitHub and save edits as direct commits with sha-based conflict detection. Ships the framework-agnostic browser runtime (`mountEditorPage`/`mountIndexPage`, create/delete, fallback editor), the GitHub forge adapter, popup and PAT session providers, and SvelteKit route factories.

Initial release of `uncial-cms-auth` — the stateless Cloudflare Worker that turns a GitHub OAuth sign-in into a single-repo-scoped GitHub App installation token, gated by a push-permission check and an in-repo `.uncial/cms.json` origin allowlist. Published as source; deploy with `wrangler`.
