---
'uncial': patch
---

Fix a block's inline editing UI writing to the wrong block, or silently doing nothing, unless that block was selected.

The `updateAttributes` prop handed to every block component wrote to whichever node the editor's selection happened to sit in, not to the block that called it. A block's own controls — captions, pickers, reorder and remove buttons — therefore edited a different block, or reported success and changed nothing, unless the reader had first clicked that block's gutter label. Blocks that sit first in a document appeared to work, because the first node is selected on load.

`updateAttributes` now addresses the calling block by its position and merges the given keys over the attributes it currently has, so a block's inline UI works wherever the block sits and whatever the reader last clicked. It still does not move the selection or focus the editor, so form controls inside a block keep focus while you type. No API change: the prop's signature and merge semantics are unchanged, and consumers need no edits.
