---
'uncial-cms': minor
---

Add `cmsImageSource(config, { base, staticDir })`, an image source that fits an upload under the forge limit, commits it under `mediaDir` and stores its served URL. `EditorPage` and `mountEditorPage` use it by default for `input: 'image'` fields; pass `imageSource` to override. `servedUrl` now accepts any `{ config }`.
