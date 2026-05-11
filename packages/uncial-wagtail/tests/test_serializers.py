from uncial_wagtail.serializers import serialize_uncial_body


def test_serialize_body_preserves_body(monkeypatch):
    body = {"type": "doc", "content": []}
    monkeypatch.setattr("uncial_wagtail.serializers.resolve_references", lambda references: {})

    assert serialize_uncial_body(body) == {"body": body, "references": {}}
