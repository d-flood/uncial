import json
from typing import Any

from django import forms

from .schema import UncialEditorConfig


class UncialWidget(forms.Widget):
    template_name = "uncial_wagtail/widgets/editor.html"

    class Media:
        css = {"all": ("uncial_wagtail/editor.css", "uncial_wagtail/editor-bundle.css")}
        js = ("uncial_wagtail/chooser-bridge.js", "uncial_wagtail/editor-bundle.js")

    def __init__(self, attrs: dict[str, Any] | None = None, config: UncialEditorConfig | None = None):
        super().__init__(attrs)
        self.config = config or UncialEditorConfig()

    def format_value(self, value: Any) -> str:
        if value in (None, ""):
            value = {"type": "doc", "content": []}
        if isinstance(value, str):
            return value
        return json.dumps(value, separators=(",", ":"))

    def value_from_datadict(self, data: Any, files: Any, name: str) -> Any:
        raw = data.get(name)
        if raw in (None, ""):
            return {}
        if isinstance(raw, (dict, list)):
            return raw
        return json.loads(raw)

    def get_context(self, name: str, value: Any, attrs: dict[str, Any] | None) -> dict[str, Any]:
        context = super().get_context(name, value, attrs)
        context["widget"]["config_json"] = json.dumps(self.config.as_dict(), separators=(",", ":"))
        return context
