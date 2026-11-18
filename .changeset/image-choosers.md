---
'uncial': minor
'uncial-cms': minor
---

Image attributes can offer the host's own Image choosers beside Upload and Choose existing (`image: { choosers, media }`, declared in the Content model's `editor.imageChoosers`). An object image value now requires alt text, edited beside the image and kept when it is replaced, unless an author marks it decorative; `image: { alt: false }` opts out.
