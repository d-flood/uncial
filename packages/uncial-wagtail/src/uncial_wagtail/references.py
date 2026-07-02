import logging
from dataclasses import dataclass
from typing import Any

from .schema import DEFAULT_IMAGE_RENDITION, get_image_rendition_allowlist

logger = logging.getLogger(__name__)


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
        attrs = node.get("attrs")
        if not isinstance(attrs, dict):
            continue
        image_id = attrs.get("imageId")
        if image_id in (None, ""):
            continue
        try:
            image_id = int(image_id)
        except (TypeError, ValueError):
            logger.warning("Skipping wagtail.image reference with non-integer imageId %r", image_id)
            continue
        rendition = attrs.get("rendition")
        if not isinstance(rendition, str) or not rendition:
            rendition = DEFAULT_IMAGE_RENDITION
        references.add(UncialReference("wagtail.image", image_id, rendition))
    return sorted(references)


def resolve_references(references: list[UncialReference]) -> dict[str, dict[str, Any]]:
    from wagtail.images import get_image_model
    from wagtail.images.exceptions import InvalidFilterSpecError

    image_model = get_image_model()
    allowlist = get_image_rendition_allowlist()
    fallback = (
        DEFAULT_IMAGE_RENDITION
        if DEFAULT_IMAGE_RENDITION in allowlist or not allowlist
        else allowlist[0]
    )
    image_ids = [reference.id for reference in references if reference.kind == "wagtail.image"]
    images = image_model.objects.in_bulk(image_ids)
    resolved: dict[str, dict[str, Any]] = {}

    for reference in references:
        if reference.kind != "wagtail.image":
            continue
        image = images.get(reference.id)
        if image is None:
            continue
        variant = reference.variant
        if variant not in allowlist:
            logger.warning(
                "Rendition spec %r for image %s is not in the allowlist; falling back to %r",
                variant,
                reference.id,
                fallback,
            )
            variant = fallback
        try:
            rendition = image.get_rendition(variant)
        except InvalidFilterSpecError:
            if variant == fallback:
                logger.warning(
                    "Skipping image %s: fallback rendition spec %r is invalid",
                    reference.id,
                    variant,
                )
                continue
            logger.warning(
                "Invalid rendition spec %r for image %s; falling back to %r",
                variant,
                reference.id,
                fallback,
            )
            variant = fallback
            try:
                rendition = image.get_rendition(variant)
            except InvalidFilterSpecError:
                logger.warning(
                    "Skipping image %s: fallback rendition spec %r is invalid",
                    reference.id,
                    variant,
                )
                continue
        resolved[reference.key] = {
            "kind": reference.kind,
            "id": reference.id,
            "rendition": variant,
            "url": rendition.url,
            "width": rendition.width,
            "height": rendition.height,
            "alt": getattr(image, "default_alt_text", "") or "",
            "title": image.title,
        }
    return resolved
