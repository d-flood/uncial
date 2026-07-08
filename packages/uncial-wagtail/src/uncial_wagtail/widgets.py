import json
from typing import Any

from django import forms
from django.urls import NoReverseMatch, reverse

from .fields import empty_uncial_document
from .schema import UncialEditorConfig


def build_api_urls() -> dict[str, str] | None:
    """Reverse the uncial_wagtail API endpoints for the widget config.

    Returns None when neither uncial_wagtail.urls nor Wagtail's chooser URL is
    mounted, in which case the ``apiUrls`` key is omitted and the frontend falls
    back to its default hardcoded paths. ``chooserModal`` degrades to an empty
    string when the Wagtail admin (and therefore the image chooser modal) is not
    installed.
    """
    api_urls = {}
    try:
        api_urls["images"] = reverse("uncial_wagtail:image_chooser_fallback")
        # Reversed for id 0; the frontend substitutes the real id into '/0/'.
        api_urls["imagePreview"] = reverse("uncial_wagtail:image_preview", args=[0])
    except NoReverseMatch:
        pass
    try:
        api_urls["chooserModal"] = reverse("wagtailimages_chooser:choose")
    except NoReverseMatch:
        if api_urls:
            api_urls["chooserModal"] = ""
    return api_urls or None


class UncialWidget(forms.Widget):
    template_name = "uncial_wagtail/widgets/editor.html"

    class Media:
        css = {"all": ("uncial_wagtail/editor-bundle.css",)}
        js = (
            "wagtailimages/js/image-chooser-modal.js",
            "uncial_wagtail/chooser-bridge.js",
            "uncial_wagtail/editor-bundle.js",
        )

    def __init__(self, attrs: dict[str, Any] | None = None, config: UncialEditorConfig | None = None):
        super().__init__(attrs)
        self.config = config or UncialEditorConfig()

    def format_value(self, value: Any) -> str:
        # Treat missing values and `{}` (untouched legacy rows stored before the
        # empty-doc default existed) as the canonical empty document. The form
        # layer may hand us either raw values or their JSON-dumped strings
        # ("null"/"{}" via forms.JSONField.prepare_value).
        if value in (None, "", "{}", "null") or value == {}:
            value = empty_uncial_document()
        if isinstance(value, str):
            return value
        return json.dumps(value, separators=(",", ":"))

    def value_from_datadict(self, data: Any, files: Any, name: str) -> Any:
        raw = data.get(name)
        if raw in (None, ""):
            return {}
        if isinstance(raw, (dict, list)):
            return raw
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            # Return the tampered payload unchanged so forms.JSONField.to_python
            # raises a ValidationError instead of the widget crashing form binding.
            return raw

    def get_context(self, name: str, value: Any, attrs: dict[str, Any] | None) -> dict[str, Any]:
        context = super().get_context(name, value, attrs)
        config = self.config.as_dict()
        api_urls = build_api_urls()
        if api_urls is not None:
            config["apiUrls"] = api_urls
        context["widget"]["config_json"] = json.dumps(config, separators=(",", ":"))
        return context
