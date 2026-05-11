from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class UncialEditorConfig:
    allowed_blocks: list[str] = field(default_factory=list)
    allowed_marks: list[str] = field(default_factory=list)
    toolbar_features: list[str] = field(default_factory=list)
    toolbar_extensions: list[dict[str, Any]] = field(default_factory=list)
    custom_blocks: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "allowedBlocks": self.allowed_blocks,
            "allowedMarks": self.allowed_marks,
            "toolbarFeatures": self.toolbar_features,
            "toolbarExtensions": self.toolbar_extensions,
            "customBlocks": self.custom_blocks,
        }
