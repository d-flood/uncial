from typing import Any

from wagtail.admin.panels import FieldPanel

from .schema import UncialEditorConfig
from .widgets import UncialWidget


class UncialPanel(FieldPanel):
    def __init__(self, field_name: str, *args: Any, config: UncialEditorConfig | None = None, **kwargs: Any):
        super().__init__(field_name, *args, **kwargs)
        self.config = config or UncialEditorConfig()

    def clone_kwargs(self) -> dict[str, Any]:
        kwargs = super().clone_kwargs()
        kwargs["config"] = self.config
        return kwargs

    def get_form_options(self) -> dict[str, Any]:
        options = super().get_form_options()
        widgets = options.setdefault("widgets", {})  # pyright: ignore[reportArgumentType]
        widgets[self.field_name] = UncialWidget(config=self.config)
        return options
