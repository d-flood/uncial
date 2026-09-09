---
'uncial-wagtail': patch
---

Rebuild the shipped editor bundle so its token defaults sit in the
`uncial-tokens` cascade layer. The committed bundle predated that change, so the
Wagtail integration served unlayered defaults that took a host's own `--uncial-*`
values back when the editor mounted.
