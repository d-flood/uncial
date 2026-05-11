from uncial_wagtail.references import collect_references


def test_collect_references_deduplicates_images():
    document = {
        "type": "doc",
        "content": [
            {"type": "wagtail.image", "attrs": {"imageId": 123, "rendition": "width-1200"}},
            {"type": "wagtail.image", "attrs": {"imageId": 123, "rendition": "width-1200"}},
        ],
    }

    references = collect_references(document)

    assert [reference.key for reference in references] == ["wagtail.image:123:width-1200"]
