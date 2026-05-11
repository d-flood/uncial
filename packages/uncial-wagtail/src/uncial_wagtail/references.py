from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, order=True)
class UncialReference:
    kind: str
    id: int
    variant: str

    @property
    def key(self) -> str:
        return f"{self.kind}:{self.id}:{self.variant}"


def _walk(node: Any):
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from _walk(value)
    elif isinstance(node, list):
        for value in node:
            yield from _walk(value)


def collect_references(document: Any) -> list[UncialReference]:
    references: set[UncialReference] = set()
    for node in _walk(document):
        if node.get("type") != "wagtail.image":
            continue
        attrs = node.get("attrs") or {}
        image_id = attrs.get("imageId")
        if image_id in (None, ""):
            continue
        references.add(
            UncialReference("wagtail.image", int(image_id), attrs.get("rendition") or "width-1200")
        )
    return sorted(references)


def resolve_references(references: list[UncialReference]) -> dict[str, dict[str, Any]]:
    from wagtail.images import get_image_model

    image_model = get_image_model()
    image_ids = [reference.id for reference in references if reference.kind == "wagtail.image"]
    images = image_model.objects.in_bulk(image_ids)
    resolved: dict[str, dict[str, Any]] = {}

    for reference in references:
        if reference.kind != "wagtail.image":
            continue
        image = images.get(reference.id)
        if image is None:
            continue
        rendition = image.get_rendition(reference.variant)
        resolved[reference.key] = {
            "kind": reference.kind,
            "id": reference.id,
            "rendition": reference.variant,
            "url": rendition.url,
            "width": rendition.width,
            "height": rendition.height,
            "alt": getattr(image, "default_alt_text", "") or "",
            "title": image.title,
        }
    return resolved
