---
'uncial': minor
'uncial-cms': minor
---

Let a host render the editor in the document's published layout. The editor
previously took inline space from the document for its own affordances — the
attributes panel held a grid column and the block gutter was reserved as padding
inside `.uncial-content` — so any host CSS deriving a width from the container
(full-bleed bands, a prose measure, container queries) computed a different
width under the editor than on the rendered page.

`Editor` (and `<uncial-editor>`) gain `presentation: 'card' | 'bare'` and widen
`attributesPanel` to `boolean | 'docked' | 'overlay' | 'off'`. Under
`presentation="bare"` the shell draws no surface of its own and reserves no
padding, so `.uncial-content`'s content box is exactly the box the host gave the
shell, and the block handles float over each block's top-left corner instead of
pushing it inwards — which also keeps them on screen for a block that bleeds
past the document column. `attributesPanel="overlay"` floats the panel against
the viewport edge while a block is selected, costing the document no width;
selection no longer auto-opens it in that mode (the block's gutter label does),
and it carries a Close button. Defaults are unchanged. `bindEditor` gains the
matching `autoOpenAttributes` option, and `mountEditorPage` forwards both
settings.
