# uncial-cms

Git-forge-backed static CMS runtime for [uncial](https://github.com/d-flood/uncial).
The site's git repository is the single source of truth: editor pages load the
backing JSON document live from the forge, mount `<uncial-editor>`, and save
edits back as commits with sha-based conflict detection.

## Exports

- `uncial-cms` — browser runtime: `mountEditorPage`, `patSessionProvider`,
  `ConflictError`, and the shared types (`UncialCmsSiteConfig`, `ForgeSession`,
  `SessionProvider`, `ForgeAdapter`).
- `uncial-cms/github` — the GitHub `ForgeAdapter` implementation
  (`createGitHubAdapter`) over the Contents API.

## PAT auth mode

`patSessionProvider` is the zero-backend auth mode: it prompts for a
fine-grained personal access token (contents read/write on the target repo)
and validates it via `GET /user`. It is the default session provider for
`mountEditorPage` and remains the permanent dev/self-service mode alongside
the auth-worker flow.

## Manual demo

```sh
bun --filter=uncial-cms run package   # ensure uncial dist exists first
cd packages/uncial-cms
bunx vite --config vite.fixture.config.ts
```

Open the served fixture with query params pointing at a sacrificial repo:

```
http://localhost:5173/?repo=<owner>/<name>&branch=main&path=content/fixture.json
```

Paste a fine-grained PAT when prompted, edit, and press **Save** — the edit
lands as a commit on the configured branch.
