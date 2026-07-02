import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.urls import reverse
from wagtail.images import get_image_model
from wagtail.images.tests.utils import get_test_image_file
from wagtail.models import Collection, GroupCollectionPermission

pytestmark = pytest.mark.django_db


@pytest.fixture(scope="session")
def django_db_use_migrations():
    # testproject.pages has no migrations, so build the schema straight from the models.
    return False


def chooser_url():
    return reverse("uncial_wagtail:image_chooser_fallback")


def preview_url(image_id):
    return reverse("uncial_wagtail:image_preview", args=[image_id])


@pytest.fixture
def collections():
    root = Collection.get_first_root_node() or Collection.add_root(name="Root")
    return {"allowed": root.add_child(name="Allowed"), "hidden": root.add_child(name="Hidden")}


@pytest.fixture
def images(collections):
    image_model = get_image_model()
    return {
        "allowed": image_model.objects.create(
            title="Allowed image", file=get_test_image_file(), collection=collections["allowed"]
        ),
        "hidden": image_model.objects.create(
            title="Hidden image", file=get_test_image_file(), collection=collections["hidden"]
        ),
    }


@pytest.fixture
def permitted_user(collections):
    group = Group.objects.create(name="Image choosers")
    GroupCollectionPermission.objects.create(
        group=group,
        collection=collections["allowed"],
        permission=Permission.objects.get(
            content_type__app_label="wagtailimages", codename="choose_image"
        ),
    )
    user = get_user_model().objects.create_user(username="chooser", password="password")
    user.groups.add(group)
    return user


@pytest.fixture
def unpermitted_user():
    return get_user_model().objects.create_user(username="plain", password="password")


def test_chooser_rejects_anonymous(client):
    assert client.get(chooser_url()).status_code == 403


def test_preview_rejects_anonymous(client):
    assert client.get(preview_url(1)).status_code == 403


def test_chooser_rejects_user_without_image_permission(client, unpermitted_user):
    client.force_login(unpermitted_user)

    assert client.get(chooser_url()).status_code == 403


def test_preview_rejects_user_without_image_permission(client, unpermitted_user, images):
    client.force_login(unpermitted_user)

    assert client.get(preview_url(images["allowed"].id)).status_code == 403


def test_chooser_rejects_non_integer_id(client, permitted_user):
    client.force_login(permitted_user)

    response = client.get(chooser_url(), {"id": "abc"})

    assert response.status_code == 400
    assert "error" in response.json()


def test_chooser_only_lists_images_in_permitted_collections(client, permitted_user, images):
    client.force_login(permitted_user)

    response = client.get(chooser_url())

    assert response.status_code == 200
    assert [image["id"] for image in response.json()["images"]] == [images["allowed"].id]


def test_chooser_id_zero_returns_empty_list(client, permitted_user, images):
    client.force_login(permitted_user)

    response = client.get(chooser_url(), {"id": "0"})

    assert response.status_code == 200
    assert response.json()["images"] == []


def test_chooser_id_filter_excludes_unpermitted_image(client, permitted_user, images):
    client.force_login(permitted_user)

    response = client.get(chooser_url(), {"id": images["hidden"].id})

    assert response.status_code == 200
    assert response.json()["images"] == []


def test_chooser_serializes_permitted_images(client, permitted_user, images):
    client.force_login(permitted_user)

    response = client.get(chooser_url(), {"id": images["allowed"].id})

    assert response.status_code == 200
    (payload,) = response.json()["images"]
    assert payload == {
        "id": images["allowed"].id,
        "title": "Allowed image",
        "previewUrl": images["allowed"].get_rendition("fill-600x400").url,
        "width": images["allowed"].width,
        "height": images["allowed"].height,
    }


def test_chooser_lists_all_images_for_superuser(client, images):
    superuser = get_user_model().objects.create_superuser(username="admin", password="password")
    client.force_login(superuser)

    response = client.get(chooser_url())

    assert response.status_code == 200
    ids = {image["id"] for image in response.json()["images"]}
    assert ids == {images["allowed"].id, images["hidden"].id}


def test_preview_redirects_to_rendition_url(client, permitted_user, images):
    client.force_login(permitted_user)

    response = client.get(preview_url(images["allowed"].id))

    assert response.status_code == 302
    assert response["Location"] == images["allowed"].get_rendition("fill-900x600").url


def test_preview_returns_404_for_unpermitted_image(client, permitted_user, images):
    client.force_login(permitted_user)

    assert client.get(preview_url(images["hidden"].id)).status_code == 404
