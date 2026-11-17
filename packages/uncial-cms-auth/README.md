# uncial-cms-auth

A stateless Cloudflare Worker that turns a GitHub OAuth sign-in into a **single-repo-scoped GitHub App installation token** for [uncial-cms](../uncial-cms). No KV, no database, no sessions: cross-request state rides in an HMAC-signed `state` value.

The project runs a canonical instance at `https://uncial-cms-auth.dflood.workers.dev`, which uncial-cms uses by default. To use your own, set `github.auth: { kind: 'worker', url, appSlug }` in your site options.

## What it guarantees

- The user's OAuth token stays on the server and never reaches the browser.
- A token is released only if the user has **push** permission on the repository **and** the initiating origin is in that repository's committed allowlist.
- The browser receives an installation token for that one repository, contents read/write only, expiring in about an hour.

## Endpoints

- `GET /auth?repo=<owner/name>&origin=<origin>&challenge=<S256-challenge>` issues a signed `state` and redirects to GitHub's authorize page (PKCE S256).
- `GET /callback?code&state` `postMessage`s `{ code, state }` to the opener at exactly the origin in the verified `state`, then closes.
- `POST /token` `{ code, state, verifier }` verifies the state and verifier, exchanges the code, checks permission and allowlist, and responds `{ token, expiresAt, repo, user }`. `Access-Control-Allow-Origin` echoes the state's origin only.

Refusals are 4xx responses with `{ "error": "<code>" }`: `invalid_repo`, `invalid_origin`, `invalid_challenge`, `invalid_request`, `invalid_state`, `stale_state`, `invalid_verifier`, `code_exchange_failed`, `no_push_permission`, `app_not_installed`, `missing_allowlist`, `origin_not_allowed`.

## Registering a site

Commit an allowlist to the repository's default branch, then install the GitHub App on the repository:

```json
// .uncial/cms.json
{ "allowedOrigins": ["https://example.com", "http://localhost:5173"] }
```

Anyone with push access can edit this file, so protect it with branch protection if that matters. On a shared-origin host such as `<user>.github.io`, allowlisting the origin authorizes every site served from it; a custom domain restores per-site granularity.

## Self-hosting

1. **Create a GitHub App** with **Contents: Read and write** and nothing else, webhooks disabled, and callback URL `https://<your-worker-domain>/callback`. Generate a client secret and a private key.
2. **Convert the private key to PKCS#8**, which WebCrypto requires:

   ```sh
   openssl pkcs8 -topk8 -nocrypt -in app.private-key.pem -out app.pkcs8.pem
   ```

3. **Set the five secrets:**

   ```sh
   wrangler secret put GITHUB_APP_ID
   wrangler secret put GITHUB_APP_PRIVATE_KEY   # the PKCS#8 PEM
   wrangler secret put GITHUB_CLIENT_ID
   wrangler secret put GITHUB_CLIENT_SECRET
   wrangler secret put STATE_SIGNING_SECRET     # any long random string
   ```

4. **Deploy** with `wrangler deploy`, and set `github.auth: { kind: 'worker', url: 'https://<your-worker-domain>', appSlug: '<your-app-slug>' }`.

## Development

```sh
pnpm run test    # vitest, GitHub API mocked
pnpm run check   # tsc --noEmit
```
