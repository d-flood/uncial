# uncial-wagtail

Wagtail integration for [Uncial](https://github.com/d-flood/uncial). It stores an
Uncial editor document in an ordinary `JSONField`, renders the Uncial block editor
inside the Wagtail admin, and serves the saved document as a headless JSON payload
with a resolved image sidecar.

Because the body is just JSON, there is no custom database column type, no
StreamField block registry to migrate, and no server-side rendering coupling: the
same document you edit in the admin is the document you fetch over HTTP and render
with the Uncial renderer (Svelte, a web component, or your own runtime) on the
frontend.

## Requirements

- Python `>= 3.11`
- Django `>= 5.2`
- Wagtail `>= 7.0`

## Install

```sh
uv add uncial-wagtail
# or
pip install uncial-wagtail
```

Add the app to `INSTALLED_APPS`:

```python
INSTALLED_APPS = [
    # ...
    "uncial_wagtail",
]
```

## Add an Uncial body to a page

There are two ways to attach the editor. Pick one.

### `UncialField` (recommended)

`UncialField` is a `JSONField` subclass that renders the Uncial editor through a
plain `FieldPanel` — no special panel required. It defaults to `blank=True` and a
valid empty document, so migrations and fresh instances are safe out of the box.

```python
from wagtail.admin.panels import FieldPanel
from wagtail.models import Page

from uncial_wagtail.fields import UncialField
from uncial_wagtail.schema import UncialEditorConfig


class ArticlePage(Page):
    body = UncialField(
        config=UncialEditorConfig(
            allowed_blocks=["wagtail.image"],
            toolbar_features=["bold", "italic", "link", "heading", "bulletList"],
        )
    )

    content_panels = Page.content_panels + [FieldPanel("body")]
```

### `UncialPanel` on a plain `JSONField`

If you'd rather keep the field a stock `models.JSONField` (for example to reuse an
existing column), attach the editor at the panel level instead. `UncialPanel`
swaps in the Uncial widget for that field and lets you set the config per panel.

```python
from django.db import models
from wagtail.models import Page

from uncial_wagtail.panels import UncialPanel
from uncial_wagtail.schema import UncialEditorConfig


class ArticlePage(Page):
    body = models.JSONField(default=dict, blank=True)

    content_panels = Page.content_panels + [
        UncialPanel("body", config=UncialEditorConfig(allowed_blocks=["wagtail.image"]))
    ]
```

The editor `config` is presentation-only. Like Wagtail's own `RichTextField`, it is
deliberately excluded from `deconstruct()`/migrations, so changing toolbar options
never generates migration noise.

## Configuring the editor: `UncialEditorConfig`

`UncialEditorConfig` maps one-to-one onto the Uncial editor options and is
serialized into the widget as JSON.

| Field | Purpose |
| --- | --- |
| `allowed_blocks` | Block ids the editor may insert (e.g. `"wagtail.image"`, plus any custom block ids). |
| `allowed_marks` | Inline mark allowlist (`"bold"`, `"italic"`, `"link"`, `"code"`, …). |
| `toolbar_features` | Which rich-text toolbar controls to show, in order. |
| `toolbar_extensions` | Keys into `window.uncialWagtail.toolbarExtensions` for custom toolbar buttons. |
| `custom_blocks` | Keys into `window.uncialWagtail.customBlocks` for app-defined blocks. |
| `image_renditions` | Rendition specs offered for `wagtail.image` blocks. Defaults to the project allowlist. |

```python
UncialEditorConfig(
    allowed_blocks=["wagtail.image", "callout", "card"],
    allowed_marks=["bold", "italic", "link", "code"],
    toolbar_features=["bold", "italic", "link", "heading", "bulletList", "blockquote"],
    custom_blocks=["callout", "card"],
)
```

## Headless API

Mount the package URLs to expose page bodies and to back the admin image chooser:

```python
# urls.py
from django.urls import include, path

urlpatterns = [
    # ...
    path("api/uncial/", include("uncial_wagtail.urls")),
]
```

This adds three routes under the `uncial_wagtail` namespace:

| Route | Name | Purpose |
| --- | --- | --- |
| `pages/<id>/` | `page_detail` | Headless JSON for a live, public page. |
| `images/` | `image_chooser_fallback` | JSON image list used when the Wagtail chooser modal is unavailable. |
| `images/<id>/preview/` | `image_preview` | Redirect to a rendition URL for admin previews. |

`page_detail` returns the document plus a **references sidecar** — every
`wagtail.image` block referenced in the body, resolved to a concrete rendition URL
and dimensions — so a frontend can render images without a second round trip:

```json
{
  "id": 4,
  "type": "pages.ArticlePage",
  "title": "Hello world",
  "body": { "type": "doc", "content": [/* … */], "version": 1 },
  "references": {
    "wagtail.image:12:width-1200": {
      "kind": "wagtail.image",
      "id": 12,
      "rendition": "width-1200",
      "url": "/media/images/photo.width-1200.jpg",
      "width": 1200,
      "height": 800,
      "alt": "A photo",
      "title": "photo.jpg"
    }
  }
}
```

### Serializing your own responses

`page_detail` is a convenience view. To serialize inside your own DRF/JSON view —
for example a different body field, or a page type with extra fields — use the
serializer helpers directly. Renditions are prefetched in a single query, so
resolving N image references does not issue N lookups.

```python
from uncial_wagtail.serializers import serialize_page, serialize_uncial_body

serialize_page(page)                       # id/type/title + body + references
serialize_page(page, body_field="content") # non-default field name
serialize_uncial_body(page.body)           # just {"body": ..., "references": ...}
```

## Reference index and image renditions

`UncialField.extract_references` feeds Wagtail's [ReferenceIndex](https://docs.wagtail.org/en/stable/advanced_topics/reference_index.html),
so images used inside a document show up under **Usage** for that image and are
protected from accidental deletion — the same as images in a `RichTextField`.

The renditions offered in the admin and used when resolving the sidecar come from
an allowlist. Override it project-wide:

```python
# settings.py
UNCIAL_IMAGE_RENDITIONS = [
    "width-800",
    "width-1600",
    "fill-1200x630",
    "original",
]
```

A reference whose stored rendition is not in the allowlist falls back to
`width-1200` (or the first allowlisted spec) rather than failing the response.

## Custom blocks and toolbar extensions

Custom blocks and toolbar buttons are authored on the frontend with the published
`uncial` block API (`defineSvelteBlock`) and registered on a shared
`window.uncialWagtail` global **before** the admin bundle initializes. The admin
bundle then instantiates each block whose id appears in a panel's `custom_blocks`
config. Registration is by key, so always **merge** into the global rather than
replacing it — the chooser bridge writes its own keys onto the same object:

```ts
// your-admin-blocks.ts — bundled and loaded in the admin before the editor
import { defineSvelteBlock } from 'uncial/core';
import Callout from './Callout.svelte';

function createCalloutBlock() {
	return defineSvelteBlock({ id: 'callout', label: 'Callout', attributes: { tone: 'info' }, component: Callout });
}

// Merge, never overwrite: `window.uncialWagtail` may already hold the chooser bridge.
const uncialWagtail = (window.uncialWagtail ??= {});
uncialWagtail.customBlocks = { ...uncialWagtail.customBlocks, callout: createCalloutBlock };
```

Load that bundle ahead of the editor. The reliable ordering hook is
`insert_global_admin_js`, which Wagtail renders before form-media JS:

```python
# wagtail_hooks.py
from django.templatetags.static import static
from django.utils.html import format_html
from wagtail import hooks


@hooks.register("insert_global_admin_js")
def register_uncial_blocks():
    return format_html('<script src="{}"></script>', static("app/admin-blocks.js"))
```

Then list the block id in the panel config: `custom_blocks=["callout"]` (and
`allowed_blocks=["callout"]` so it can be inserted).

## Demo project

A runnable Wagtail project lives in [`demo/`](./demo) — including the callout/card
custom blocks and image blocks wired end to end. See its
[README](./demo/README.md) to start it locally.
