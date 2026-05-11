from typing import Any

from .references import collect_references, resolve_references


def serialize_uncial_body(body: Any) -> dict[str, Any]:
    return {"body": body, "references": resolve_references(collect_references(body))}


def serialize_page(page: Any, body_field: str = "body") -> dict[str, Any]:
    body = getattr(page, body_field)
    payload = serialize_uncial_body(body)
    return {
        "id": page.id,
        "type": page.specific_class._meta.label,
        "title": page.title,
        **payload,
    }
