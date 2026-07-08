from django.test import override_settings

from uncial_wagtail.schema import (
    DEFAULT_IMAGE_RENDITIONS,
    UncialEditorConfig,
    get_image_rendition_allowlist,
)


def test_config_serializes_frontend_keys():
    config = UncialEditorConfig(allowed_blocks=["wagtail.image"], allowed_marks=["bold"])

    assert config.as_dict()["allowedBlocks"] == ["wagtail.image"]
    assert config.as_dict()["allowedMarks"] == ["bold"]


def test_config_serializes_registry_keys_as_strings():
    config = UncialEditorConfig(
        toolbar_extensions=["highlight", "smallcaps"], custom_blocks=["callout", "card"]
    )

    assert config.as_dict()["toolbarExtensions"] == ["highlight", "smallcaps"]
    assert config.as_dict()["customBlocks"] == ["callout", "card"]


def test_config_serializes_default_image_renditions():
    config = UncialEditorConfig()

    assert config.as_dict()["imageRenditions"] == [
        "width-400",
        "width-800",
        "width-1200",
        "fill-600x400",
        "fill-900x600",
        "original",
    ]
    assert config.as_dict()["imageRenditions"] == DEFAULT_IMAGE_RENDITIONS


def test_config_serializes_explicit_image_renditions():
    config = UncialEditorConfig(image_renditions=["width-50"])

    assert config.as_dict()["imageRenditions"] == ["width-50"]


@override_settings(UNCIAL_IMAGE_RENDITIONS=["width-100", "original"])
def test_image_rendition_allowlist_reads_setting():
    assert get_image_rendition_allowlist() == ["width-100", "original"]
    assert UncialEditorConfig().as_dict()["imageRenditions"] == ["width-100", "original"]


def test_image_rendition_allowlist_defaults_without_setting():
    assert get_image_rendition_allowlist() == DEFAULT_IMAGE_RENDITIONS
