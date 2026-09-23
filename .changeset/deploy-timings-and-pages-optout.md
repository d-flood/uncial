---
'uncial-cms': minor
---

Make the CMS usable by a site that neither deploys to GitHub Pages nor builds in
five minutes.

- `defineSite` takes `deployStatus`, overriding any of the deploy-status polling
  timings, and resolves them onto `Site.deployStatusTimings`. `createEditorSession`
  accepts `timings` and `schedule` and forwards both to the polling loop, so a
  twenty-minute pipeline can say so instead of ending every save on "status unknown".
- `uncial-cms doctor --no-pages` reports the GitHub Pages probe as skipped rather
  than failing, for a site served from somewhere else. Without the flag a
  misconfigured Pages site still fails.
