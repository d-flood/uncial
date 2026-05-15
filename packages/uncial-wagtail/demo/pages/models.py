from django.db import models
from wagtail.admin.panels import FieldPanel
from wagtail.fields import RichTextField
from wagtail.models import Page

from uncial_wagtail.panels import UncialPanel
from uncial_wagtail.schema import UncialEditorConfig


class HomePage(Page):
    intro = RichTextField(blank=True)

    content_panels = Page.content_panels + [FieldPanel("intro")]


class DemoArticlePage(Page):
    summary = models.TextField(blank=True)
    body = models.JSONField(default=dict, blank=True)

    parent_page_types = ["pages.HomePage"]
    subpage_types = []

    content_panels = Page.content_panels + [
        FieldPanel("summary"),
        UncialPanel(
            "body",
            config=UncialEditorConfig(
				allowed_blocks=["wagtail.image", "callout", "card"],
                allowed_marks=["bold", "italic", "link", "code"],
                toolbar_features=["bold", "italic", "link", "heading", "bulletList", "blockquote"],
                custom_blocks=["callout"],
            ),
        ),
    ]
