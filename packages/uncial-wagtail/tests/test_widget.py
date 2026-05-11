from uncial_wagtail.schema import UncialEditorConfig
from uncial_wagtail.widgets import UncialWidget


def test_widget_round_trips_json():
    widget = UncialWidget(config=UncialEditorConfig(allowed_blocks=["wagtail.image"]))
    value = {"type": "doc", "content": []}

    assert widget.value_from_datadict({"body": widget.format_value(value)}, {}, "body") == value
