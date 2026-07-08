import json

from django import forms
from django.test import override_settings
from django.urls import reverse

from uncial_wagtail.forms import UncialJSONFormField
from uncial_wagtail.schema import UncialEditorConfig
from uncial_wagtail.widgets import UncialWidget

EMPTY_DOCUMENT_JSON = '{"type":"doc","content":[],"version":1}'


class BodyForm(forms.Form):
    body = UncialJSONFormField()


def widget_config(widget, name="body", value=None):
    context = widget.get_context(name, widget.format_value(value), None)
    return json.loads(context["widget"]["config_json"])


def test_widget_round_trips_json():
    widget = UncialWidget(config=UncialEditorConfig(allowed_blocks=["wagtail.image"]))
    value = {"type": "doc", "content": []}

    assert widget.value_from_datadict({"body": widget.format_value(value)}, {}, "body") == value


def test_widget_parses_valid_json_string_to_dict():
    widget = UncialWidget()

    value = widget.value_from_datadict({"body": '{"type":"doc","content":[]}'}, {}, "body")

    assert value == {"type": "doc", "content": []}


def test_widget_returns_empty_dict_for_empty_string():
    widget = UncialWidget()

    assert widget.value_from_datadict({"body": ""}, {}, "body") == {}


def test_widget_returns_invalid_json_string_unchanged():
    widget = UncialWidget()

    assert widget.value_from_datadict({"body": "{not json"}, {}, "body") == "{not json"


def test_widget_passes_through_already_parsed_container_values():
    widget = UncialWidget()

    assert widget.value_from_datadict({"body": {}}, {}, "body") == {}
    assert widget.value_from_datadict({"body": []}, {}, "body") == []


def test_widget_parses_empty_object_json_string():
    widget = UncialWidget()

    assert widget.value_from_datadict({"body": "{}"}, {}, "body") == {}


def test_widget_parses_null_json_string_to_none():
    widget = UncialWidget()

    # A literal "null" string is valid JSON; it decodes to None (the form layer
    # then treats it as an empty value) rather than crashing form binding.
    assert widget.value_from_datadict({"body": "null"}, {}, "body") is None


def test_form_accepts_valid_json_payload():
    form = BodyForm(data={"body": '{"type":"doc","content":[]}'})

    assert form.is_valid()
    assert form.cleaned_data["body"] == {"type": "doc", "content": []}


def test_form_rejects_tampered_json_payload_with_validation_error():
    form = BodyForm(data={"body": "{not json"})

    assert not form.is_valid()
    assert form.errors["body"] == ["Enter a valid JSON."]


def test_format_value_treats_none_and_empty_string_as_empty_doc():
    widget = UncialWidget()

    assert widget.format_value(None) == EMPTY_DOCUMENT_JSON
    assert widget.format_value("") == EMPTY_DOCUMENT_JSON
    # forms.JSONField.prepare_value(None) hands the widget the string "null".
    assert widget.format_value("null") == EMPTY_DOCUMENT_JSON


def test_format_value_treats_legacy_empty_dict_row_as_empty_doc():
    widget = UncialWidget()

    # Untouched legacy rows stored `{}` (the old `default=dict`); the form
    # layer may hand the widget either the raw dict or its JSON string.
    assert widget.format_value({}) == EMPTY_DOCUMENT_JSON
    assert widget.format_value("{}") == EMPTY_DOCUMENT_JSON


def test_format_value_preserves_real_documents():
    widget = UncialWidget()
    document = {"type": "doc", "content": [{"type": "paragraph"}]}

    assert json.loads(widget.format_value(document)) == document


def test_widget_renders_hidden_textarea_with_stable_hook():
    widget = UncialWidget()

    html = widget.render("body", {"type": "doc", "content": [], "version": 1})

    assert "<textarea" in html
    assert "data-uncial-input" in html
    assert 'name="body"' in html
    assert "<input" not in html
    assert "data-uncial-editor" in html
    assert "&quot;type&quot;:&quot;doc&quot;" in html


def test_widget_renders_legacy_empty_dict_as_empty_doc():
    widget = UncialWidget()

    html = widget.render("body", {})

    assert "&quot;type&quot;:&quot;doc&quot;" in html
    assert "&quot;version&quot;:1" in html


def test_widget_media_loads_wagtail_chooser_bridge_before_editor_bundle():
    media_js = list(UncialWidget().media._js)

    assert media_js == [
        "wagtailimages/js/image-chooser-modal.js",
        "uncial_wagtail/chooser-bridge.js",
        "uncial_wagtail/editor-bundle.js",
    ]


def test_config_json_injects_api_urls():
    widget = UncialWidget(config=UncialEditorConfig(allowed_blocks=["wagtail.image"]))

    config = widget_config(widget)

    assert config["apiUrls"] == {
        "images": "/api/uncial/images/",
        "imagePreview": "/api/uncial/images/0/preview/",
        # testproject.urls does not mount the Wagtail admin, so the chooser
        # modal URL degrades to an empty string.
        "chooserModal": "",
    }
    assert config["allowedBlocks"] == ["wagtail.image"]


@override_settings(ROOT_URLCONF="testproject.urls_admin")
def test_config_json_includes_chooser_modal_url_when_admin_is_mounted():
    widget = UncialWidget()

    config = widget_config(widget)

    assert config["apiUrls"]["chooserModal"] == reverse("wagtailimages_chooser:choose")
    assert config["apiUrls"]["chooserModal"] != ""
    assert config["apiUrls"]["images"] == "/api/uncial/images/"
    assert "/0/" in config["apiUrls"]["imagePreview"]


@override_settings(ROOT_URLCONF="testproject.urls_blank")
def test_config_json_omits_api_urls_when_endpoints_are_not_mounted():
    widget = UncialWidget()

    config = widget_config(widget)

    assert "apiUrls" not in config


@override_settings(ROOT_URLCONF="testproject.urls_admin_only")
def test_config_json_includes_chooser_modal_when_only_admin_is_mounted():
    widget = UncialWidget()

    config = widget_config(widget)

    assert config["apiUrls"] == {"chooserModal": reverse("wagtailimages_chooser:choose")}
