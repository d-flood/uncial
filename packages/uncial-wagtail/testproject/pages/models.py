from wagtail.admin.panels import FieldPanel
from wagtail.models import Page

from uncial_wagtail.fields import UncialField
from uncial_wagtail.schema import UncialEditorConfig


class ArticlePage(Page):
    body = UncialField(
        config=UncialEditorConfig(
            allowed_blocks=["wagtail.image", "callout", "card"],
            allowed_marks=["bold", "italic", "link"],
            toolbar_features=["bold", "italic", "link", "heading"],
        )
    )

    # A plain FieldPanel is enough: UncialField.formfield() supplies the widget
    # configured with the field's UncialEditorConfig.
    content_panels = Page.content_panels + [FieldPanel("body")]
