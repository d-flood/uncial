---
'uncial-cms': patch
---

The GitHub adapter revalidates `readFile`, so loading or reloading the editor right after a commit no longer gets a stale sha and a false save conflict.
