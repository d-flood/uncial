from uncial_wagtail.schema import UncialEditorConfig


def test_config_serializes_frontend_keys():
    config = UncialEditorConfig(allowed_blocks=["wagtail.image"], allowed_marks=["bold"])

    assert config.as_dict()["allowedBlocks"] == ["wagtail.image"]
    assert config.as_dict()["allowedMarks"] == ["bold"]
