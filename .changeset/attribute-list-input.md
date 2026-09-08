---
'uncial': minor
---

Add `list`, an attribute input for array-valued attributes. Declaring
`list: { fields: { label: '', value: '' } }` (records) or
`list: { value: { default: '', options } }` (single values) renders the
attribute in the panel as one control per item with add, remove and reorder,
instead of the raw JSON textarea that `input: 'json'` falls back to — an
attribute an author can only edit by typing valid JSON is not editable by the
people a CMS is for. The stored value is unchanged: it is the same array, so
adopting `list` needs no content migration and keeps the attribute's existing
`validate`. `defineBlock` rejects a `list` that declares neither `fields` nor
`value`, since there would be no field to render.

Also: a block's rendered output no longer lags its attributes. Attribute edits
reach the node view inside `view.dispatch`, itself inside the event handler that
made the edit, and a prop written to a separately mounted component in that
window does not reach it — the block kept rendering its old attributes until
something else re-rendered it, so an author editing a headline saw nothing
change. The node view now queues that prop update onto a microtask, outside the
dispatch window and still before paint.
