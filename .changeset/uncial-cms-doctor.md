---
'uncial-cms': minor
---

`uncial-cms doctor --origin <https://host>` checks the provisioning a site owner
would otherwise learn about from a failed sign-in. Through the authenticated
`gh` CLI it reports whether the GitHub App is installed on the repository,
whether you have push permission on it, whether `.uncial/cms.json` is committed
on the default branch and lists the origin exactly, and whether Pages is enabled
— with the custom domain matching the origin's host and HTTPS enforced when the
origin is not a `github.io` one. Every check runs and prints its own ✓/✗ line, a
failure names the auth worker refusal it would have produced
(`app_not_installed`, `no_push_permission`, `missing_allowlist`,
`origin_not_allowed`) alongside the fix, and a `github.io` origin draws a
warning that allowlisting a shared origin authorises every project page served
from it. Where GitHub answers the App-installation route only to a token
authorized to a GitHub App — which a `gh auth login` token is not — that one
check warns and names the install page to check by eye, rather than reporting an
installation you have as missing. `--repo` defaults to the current checkout, `--app-slug` to the
canonical app and `--branch` to the repository's default branch. The command
exits 0 only when everything passes, 1 when a check fails, and 2 when `gh` is
missing or unauthenticated — one instruction, no stack trace. It replaces the
shell provisioning wizard one consumer carried; DNS and HTTPS reachability
probes stay in the docs checklist.
