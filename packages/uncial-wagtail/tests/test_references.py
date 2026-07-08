import pytest
from django.test import override_settings
from wagtail.images import get_image_model
from wagtail.images.tests.utils import get_test_image_file
from wagtail.models import Collection

from uncial_wagtail.references import UncialReference, collect_references, resolve_references


@pytest.fixture
def image(db):
    if not Collection.objects.exists():
        Collection.add_root(name="Root")
    return get_image_model().objects.create(title="Test image", file=get_test_image_file())


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


def test_resolve_references_honors_allowlisted_spec(image):
    reference = UncialReference("wagtail.image", image.id, "width-400")

    resolved = resolve_references([reference])

    assert resolved[reference.key]["rendition"] == "width-400"
    assert resolved[reference.key]["width"] == 400


def test_resolve_references_falls_back_for_unlisted_spec(image, caplog):
    reference = UncialReference("wagtail.image", image.id, "width-999999999")

    with caplog.at_level("WARNING", logger="uncial_wagtail.references"):
        resolved = resolve_references([reference])

    assert resolved[reference.key]["rendition"] == "width-1200"
    assert resolved[reference.key]["url"]
    assert "width-999999999" in caplog.text


def test_resolve_references_falls_back_for_garbage_spec(image):
    reference = UncialReference("wagtail.image", image.id, "; DROP")

    resolved = resolve_references([reference])

    assert resolved[reference.key]["rendition"] == "width-1200"
    assert resolved[reference.key]["url"]


@override_settings(UNCIAL_IMAGE_RENDITIONS=["width-100"])
def test_resolve_references_respects_setting_override(image):
    allowed = UncialReference("wagtail.image", image.id, "width-100")
    disallowed = UncialReference("wagtail.image", image.id, "width-400")

    resolved = resolve_references([allowed, disallowed])

    assert resolved[allowed.key]["rendition"] == "width-100"
    # The fallback must itself come from the configured allowlist, not the
    # built-in default (which is excluded here).
    assert resolved[disallowed.key]["rendition"] == "width-100"


def test_resolve_references_query_count_is_flat_in_reference_count(db, django_assert_num_queries):
    # The rendition cache survives test transactions; clear it so the
    # pre-generation below reliably creates real database rows.
    get_image_model().get_rendition_model().cache_backend.clear()
    if not Collection.objects.exists():
        Collection.add_root(name="Root")
    image_model = get_image_model()
    images = [
        image_model.objects.create(title=f"Image {index}", file=get_test_image_file())
        for index in range(4)
    ]
    # Pre-generate the renditions so we measure lookup cost, not creation cost.
    for image in images:
        image.get_rendition("width-400")
    references = [UncialReference("wagtail.image", image.id, "width-400") for image in images]

    # One query for the images plus one prefetch query for all renditions,
    # regardless of how many references are resolved.
    with django_assert_num_queries(2):
        resolved = resolve_references(references)
    with django_assert_num_queries(2):
        resolve_references(references[:1])

    assert len(resolved) == len(images)
    assert {entry["id"] for entry in resolved.values()} == {image.id for image in images}


def test_resolve_references_returns_empty_dict_without_queries(db, django_assert_num_queries):
    with django_assert_num_queries(0):
        assert resolve_references([]) == {}


def test_collect_references_skips_malformed_nodes():
    document = {
        "type": "doc",
        "content": [
            {"type": "wagtail.image", "attrs": "not-a-dict"},
            {"type": "wagtail.image", "attrs": {"imageId": "abc"}},
            {"type": "wagtail.image", "attrs": {"imageId": {"nested": True}}},
            {"type": "wagtail.image", "attrs": {"imageId": 5, "rendition": {"bad": 1}}},
        ],
    }

    references = collect_references(document)

    assert [reference.key for reference in references] == ["wagtail.image:5:width-1200"]
