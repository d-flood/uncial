---
'uncial': minor
---

Add a mark-renderer registry so custom inline marks render server-side. `createMarkRegistry`
mirrors `createBlockRegistry`, and `Renderer` takes a `marks` prop alongside `blocks`. An
unregistered mark still degrades to bare text, and registration remains separate from a
schema's `allowedMarks` permission.
