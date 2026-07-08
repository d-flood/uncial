from dataclasses import dataclass, field
from typing import Any

from django.conf import settings

DEFAULT_IMAGE_RENDITION = "width-1200"
DEFAULT_IMAGE_RENDITIONS = [
    "width-400",
    "width-800",
    "width-1200",
    "fill-600x400",
    "fill-900x600",
    "original",
]


def get_image_rendition_allowlist() -> list[str]:
    renditions = getattr(settings, "UNCIAL_IMAGE_RENDITIONS", None)
    if renditions is None:
        return list(DEFAULT_IMAGE_RENDITIONS)
    return list(renditions)


@dataclass(frozen=True)
class UncialEditorConfig:
    allowed_blocks: list[str] = field(default_factory=list)
    allowed_marks: list[str] = field(default_factory=list)
    toolbar_features: list[str] = field(default_factory=list)
    # Keys into the window.uncialWagtail.toolbarExtensions registry populated by
    # consumer scripts before the admin bundle initializes.
    toolbar_extensions: list[str] = field(default_factory=list)
    # Keys into the window.uncialWagtail.customBlocks registry (block ids).
    custom_blocks: list[str] = field(default_factory=list)
    image_renditions: list[str] = field(default_factory=get_image_rendition_allowlist)

    def as_dict(self) -> dict[str, Any]:
        return {
            "allowedBlocks": self.allowed_blocks,
            "allowedMarks": self.allowed_marks,
            "toolbarFeatures": self.toolbar_features,
            "toolbarExtensions": self.toolbar_extensions,
            "customBlocks": self.custom_blocks,
            "imageRenditions": self.image_renditions,
        }
