import pytest
from wagtail.images import get_image_model
from wagtail.images.tests.utils import get_test_image_file
from wagtail.models import Collection, Locale, Page, ReferenceIndex

from testproject.pages.models import ArticlePage
from uncial_wagtail.fields import UncialField, empty_uncial_document
from uncial_wagtail.forms import UncialJSONFormField
from uncial_wagtail.schema import UncialEditorConfig
from uncial_wagtail.widgets import UncialWidget


@pytest.fixture
def image(db):
    if not Collection.objects.exists():
        Collection.add_root(name="Root")
    return get_image_model().objects.create(title="Test image", file=get_test_image_file())


@pytest.fixture
def root_page(db):
    Locale.objects.get_or_create(language_code="en")
    root = Page.get_first_root_node()
    if root is None:
        root = Page.add_root(instance=Page(title="Root", slug="root"))
    return root


def test_empty_uncial_document_is_a_valid_empty_doc():
    assert empty_uncial_document() == {"type": "doc", "content": [], "version": 1}


def test_empty_uncial_document_returns_a_fresh_object_each_call():
    first = empty_uncial_document()
    second = empty_uncial_document()

    assert first == second
    assert first is not second
    assert first["content"] is not second["content"]


def test_field_defaults_to_empty_document():
    field = UncialField()

    assert field.has_default()
    assert field.get_default() == {"type": "doc", "content": [], "version": 1}
    assert field.blank is True


def test_field_default_and_blank_can_be_overridden():
    field = UncialField(default=dict, blank=False)

    assert field.get_default() == {}
    assert field.blank is False


def test_formfield_uses_uncial_form_field_and_widget_with_config():
    config = UncialEditorConfig(allowed_blocks=["wagtail.image"])
    field = UncialField(config=config)

    form_field = field.formfield()

    assert isinstance(form_field, UncialJSONFormField)
    assert isinstance(form_field.widget, UncialWidget)
    assert form_field.widget.config is config


def test_formfield_honors_explicit_widget_override():
    panel_config = UncialEditorConfig(allowed_marks=["bold"])
    field = UncialField(config=UncialEditorConfig())
    override = UncialWidget(config=panel_config)

    form_field = field.formfield(widget=override)

    # django.forms.Field deep-copies widget instances, so compare configs
    # rather than widget identity.
    assert isinstance(form_field.widget, UncialWidget)
    assert form_field.widget.config is panel_config


def test_deconstruct_omits_config_and_keeps_serializable_default():
    field = UncialField(config=UncialEditorConfig(allowed_blocks=["wagtail.image"]))
    field.set_attributes_from_name("body")

    name, path, args, kwargs = field.deconstruct()

    assert path == "uncial_wagtail.fields.UncialField"
    assert "config" not in kwargs
    assert kwargs["default"] is empty_uncial_document
    assert kwargs["blank"] is True

    rebuilt = UncialField(*args, **kwargs)
    assert rebuilt.get_default() == {"type": "doc", "content": [], "version": 1}


def test_clone_preserves_config():
    config = UncialEditorConfig(allowed_blocks=["wagtail.image"])
    field = UncialField(config=config)
    field.set_attributes_from_name("body")

    clone = field.clone()

    assert isinstance(clone, UncialField)
    assert clone.config is config


def test_extract_references_yields_image_reference_tuples(db):
    field = UncialField()
    document = {
        "type": "doc",
        "content": [
            {"type": "wagtail.image", "attrs": {"imageId": 7, "rendition": "width-400"}},
            {"type": "wagtail.image", "attrs": {"imageId": 7, "rendition": "width-400"}},
            {"type": "wagtail.image", "attrs": {"imageId": "abc"}},
            {"type": "paragraph", "content": [{"type": "text", "text": "hello"}]},
        ],
        "version": 1,
    }

    assert list(field.extract_references(document)) == [(get_image_model(), "7", "", "")]


def test_extract_references_yields_nothing_for_empty_document(db):
    field = UncialField()

    assert list(field.extract_references(empty_uncial_document())) == []


def test_article_page_is_reference_indexable(db):
    assert ReferenceIndex.model_is_indexable(ArticlePage)


def test_reference_index_reports_image_used_by_page_body(root_page, image):
    page = ArticlePage(
        title="Article",
        slug="article",
        body={
            "type": "doc",
            "content": [
                {
                    "type": "wagtail.image",
                    "attrs": {"imageId": image.id, "rendition": "width-800"},
                }
            ],
            "version": 1,
        },
    )
    root_page.add_child(instance=page)

    ReferenceIndex.create_or_update_for_object(page)

    references = ReferenceIndex.get_references_to(image)
    assert references.count() == 1
    record = references.get()
    assert record.object_id == str(page.pk)
    assert record.content_type.model_class() is ArticlePage
    assert record.to_object_id == str(image.pk)
    assert record.model_path == "body."
