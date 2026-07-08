"""Load the demo custom-block bundle in the Wagtail admin.

The bundle registers block factories on ``window.uncialWagtail.customBlocks``
at script-eval time, so it must execute before the Uncial admin bundle
initializes its widgets. ``insert_global_admin_js`` output is rendered in
``wagtailadmin/admin_base.html`` *before* the ``extra_js`` block that emits
form media (``UncialWidget.Media`` -> editor-bundle.js) and the
``insert_editor_js`` hook, which makes it the reliable ordering mechanism.
"""

from django.templatetags.static import static
from django.utils.html import format_html
from wagtail import hooks


@hooks.register("insert_global_admin_js")
def demo_blocks_js():
    return format_html('<script src="{}"></script>', static("pages/demo-blocks.js"))


@hooks.register("insert_global_admin_css")
def demo_blocks_css():
    return format_html('<link rel="stylesheet" href="{}">', static("pages/demo-blocks.css"))
