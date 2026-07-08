from testproject.pages.models import ArticlePage
from uncial_wagtail.panels import UncialPanel
from uncial_wagtail.schema import UncialEditorConfig
from uncial_wagtail.widgets import UncialWidget


def test_plain_uncial_panel_preserves_field_level_config():
    config = ArticlePage._meta.get_field("body").config
    panel = UncialPanel("body").bind_to_model(ArticlePage)

    form_field = ArticlePage.get_edit_handler().get_form_class().base_fields["body"]

    assert panel.get_form_options().get("widgets") is None
    assert isinstance(form_field.widget, UncialWidget)
    assert form_field.widget.config is config


def test_uncial_panel_explicit_config_overrides_field_level_config():
    config = UncialEditorConfig(allowed_blocks=["wagtail.image"])
    panel = UncialPanel("body", config=config).bind_to_model(ArticlePage)

    widget = panel.get_form_options()["widgets"]["body"]

    assert isinstance(widget, UncialWidget)
    assert widget.config is config
