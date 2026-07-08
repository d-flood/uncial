"""URLconf used by widget tests to exercise chooser-modal URL reversal."""

from django.urls import include, path
from wagtail.admin import urls as wagtailadmin_urls

urlpatterns = [
    path("admin/", include(wagtailadmin_urls)),
    path("api/uncial/", include("uncial_wagtail.urls")),
]
