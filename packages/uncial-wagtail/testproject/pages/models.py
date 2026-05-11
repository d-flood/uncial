from django.db import models
from wagtail.models import Page

from uncial_wagtail.panels import UncialPanel
from uncial_wagtail.schema import UncialEditorConfig


class ArticlePage(Page):
    body = models.JSONField(default=dict, blank=True)

    content_panels = Page.content_panels + [
        UncialPanel(
            "body",
            config=UncialEditorConfig(
                allowed_blocks=["wagtail.image"],
                allowed_marks=["bold", "italic", "link"],
                toolbar_features=["bold", "italic", "link", "heading"],
            ),
        )
    ]
