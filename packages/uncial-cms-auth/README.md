# uncial-cms-auth

A stateless Cloudflare Worker that turns a GitHub OAuth sign-in into a
**single-repo-scoped GitHub App installation token** for
[uncial-cms](../uncial-cms). No KV, no database, no sessions: all
cross-request state rides in an HMAC-signed `state` value.

The project runs a **canonical hosted instance** at
`https://uncial-cms-auth.dflood.workers.dev` — point your site config's
`authWorkerUrl` at it and no deployment is needed. Self-hosting is equally
first-class (see below); the `uncial-cms` runtime accepts any `authWorkerUrl`.

## What it guarantees

- The user's OAuth token is used server-side only and is never sent to the
  browser.
- A token is released only if the authenticated user has **push** permission
  on the claimed repository **and** the initiating origin is listed in that
  repository's committed allowlist (see below).
- The token the browser receives is a GitHub App installation access token
  restricted to that one repository with contents read/write only (~1 hour
  expiry).

## Endpoints

The canonical instance serves these at
`https://uncial-cms-auth.dflood.workers.dev`; a self-hosted worker serves them
at its own `*.workers.dev` (or custom) domain.

- `GET /auth?repo=<owner/name>&origin=<origin>&challenge=<S256-challenge>` —
  validates the parameters, issues a signed `state`, and redirects to GitHub's
  authorize page (PKCE S256).
- `GET /callback?code&state` — static relay page that `postMessage`s
  `{ code, state }` to `window.opener` at exactly the origin recovered from
  the verified `state`, then closes.
- `POST /token` `{ code, state, verifier }` — verifies the state and PKCE
  verifier, exchanges the code server-side, runs the permission and allowlist
  checks, and responds `{ token, expiresAt, repo, user }`. The
  `Access-Control-Allow-Origin` header echoes the state's origin only.

Refusals are distinct 4xx responses with a machine-readable
`{ "error": "<code>" }` body: `invalid_repo`, `invalid_origin`,
`invalid_challenge`, `invalid_request`, `invalid_state`, `stale_state`,
`invalid_verifier`, `code_exchange_failed`, `no_push_permission`,
`app_not_installed`, `missing_allowlist`, `origin_not_allowed`.

## Registering a site (site owners)

There is no registration UI. Commit an allowlist file to your repository's
default branch:

```json
// .uncial/cms.json
{ "allowedOrigins": ["https://example.com", "http://localhost:5173"] }
```

Anyone with push access can edit this file; protect it with branch protection
if that matters to you. Note that on shared-origin hosts (e.g.
`<user>.github.io` project pages) allowlisting the origin authorizes every
site served from it — a custom domain restores per-site granularity.

Then install the GitHub App on the repository (the `appSlug` in your site
config links editors to the install page).

## Self-hosting

The canonical instance is hosted by the project, but self-hosting is
first-class — the `uncial-cms` runtime accepts any `authWorkerUrl`.

1. **Create a GitHub App** (Settings → Developer settings → GitHub Apps):
   - Repository permissions: **Contents: Read and write**. Nothing else.
   - Webhooks: disabled.
   - Callback URL: `https://<your-worker-domain>/callback`.
   - "Request user authorization (OAuth) during installation" is not
     required; editors authorize on first sign-in.
   - Generate a **client secret** and a **private key**.
2. **Convert the private key to PKCS#8** (GitHub downloads PKCS#1, which
   WebCrypto cannot import):

   ```sh
   openssl pkcs8 -topk8 -nocrypt -in app.private-key.pem -out app.pkcs8.pem
   ```

3. **Set the five secrets** (names are the contract):

   ```sh
   wrangler secret put GITHUB_APP_ID
   wrangler secret put GITHUB_APP_PRIVATE_KEY   # paste the PKCS#8 PEM
   wrangler secret put GITHUB_CLIENT_ID
   wrangler secret put GITHUB_CLIENT_SECRET
   wrangler secret put STATE_SIGNING_SECRET     # any long random string
   ```

4. **Deploy:**

   ```sh
   wrangler deploy
   ```

Point your site config's `authWorkerUrl` at the worker and set `appSlug` to
your GitHub App's slug.

## Development

```sh
bun run test    # vitest, GitHub API fully mocked
bun run check   # tsc --noEmit
```
