from collections.abc import Iterator
from typing import Any

from django.db import models

from .references import collect_references
from .schema import UncialEditorConfig


def empty_uncial_document() -> dict[str, Any]:
    """Return a fresh, valid empty Uncial document.

    Module-level so migrations can serialize it as the field default, and a
    callable so model instances never share a mutable default value.
    """
    return {"type": "doc", "content": [], "version": 1}


class UncialField(models.JSONField):
    """A JSONField that stores an Uncial document and renders the Uncial editor.

    Accepts an optional ``config`` (an :class:`~uncial_wagtail.schema.UncialEditorConfig`)
    that is passed through to the admin widget. A plain ``FieldPanel`` picks the
    widget up automatically via :meth:`formfield`; ``UncialPanel`` remains available
    to override the config per-panel.
    """

    def __init__(self, *args: Any, config: UncialEditorConfig | None = None, **kwargs: Any):
        # `config` is presentation-only and is intentionally kept out of
        # deconstruct()/migrations (the same approach wagtail.fields.RichTextField
        # takes with `editor`/`features`): serializing it would only generate
        # migration noise whenever toolbar options change.
        self.config = config or UncialEditorConfig()
        kwargs.setdefault("default", empty_uncial_document)
        kwargs.setdefault("blank", True)
        super().__init__(*args, **kwargs)

    def clone(self) -> "UncialField":
        name, path, args, kwargs = self.deconstruct()
        # Re-attach the config that deconstruct() deliberately omits.
        kwargs["config"] = self.config
        return self.__class__(*args, **kwargs)

    def formfield(self, **kwargs: Any) -> Any:
        from .forms import UncialJSONFormField
        from .widgets import UncialWidget

        defaults: dict[str, Any] = {
            "form_class": UncialJSONFormField,
            "widget": UncialWidget(config=self.config),
        }
        defaults.update(kwargs)
        return super().formfield(**defaults)

    def extract_references(
        self, value: Any
    ) -> Iterator[tuple[type[models.Model], str, str, str]]:
        """Yield Wagtail ReferenceIndex tuples for images used in the document.

        Tuple shape matches wagtail.images.rich_text.ImageEmbedHandler.extract_references:
        (model, object_id, model_path, content_path).
        """
        from wagtail.images import get_image_model

        image_model = get_image_model()
        for reference in collect_references(value):
            if reference.kind != "wagtail.image":
                continue
            yield image_model, str(reference.id), "", ""
