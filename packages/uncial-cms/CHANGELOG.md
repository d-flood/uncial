# uncial-cms

## 1.0.0

### Minor Changes

- 03f7bdd: Add a basic single-image upload capability, reversing the former "no media upload" non-goal. New public `uploadAsset(deps, file, opts)` commits an image into the repo at a content-addressed path (`<mediaDir>/<hash>.<ext>`) so identical bytes reuse the existing file and never collide; files over the Contents API limit (~1 MB) reject with a clear error. `uploadImageAsset(file, opts)` is an editor-facing convenience that resolves the adapter/author from the active editor session. The `ForgeAdapter` gains binary `writeFile` support (base64-encoded PUT to the Contents API, same conflict/sha semantics as text). `UncialCmsSiteConfig` gains an optional `mediaDir` field.
- 5a38e4a: Initial release of uncial-cms — a git-forge-backed static CMS where the site's git repository is the single source of truth. Every content page gets a generated editor variant plus a `/uncial/` site index; editors sign in with GitHub and save edits as direct commits with sha-based conflict detection. Ships the framework-agnostic browser runtime (`mountEditorPage`/`mountIndexPage`, create/delete, fallback editor), the GitHub forge adapter, popup and PAT session providers, and SvelteKit route factories.

  Initial release of `uncial-cms-auth` — the stateless Cloudflare Worker that turns a GitHub OAuth sign-in into a single-repo-scoped GitHub App installation token, gated by a push-permission check and an in-repo `.uncial/cms.json` origin allowlist. Published as source; deploy with `wrangler`.

### Patch Changes

- Updated dependencies [c9f709a]
  - uncial@1.0.0
