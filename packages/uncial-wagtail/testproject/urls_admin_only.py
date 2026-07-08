"""URLconf used by widget tests when only the Wagtail admin is mounted."""

from django.urls import include, path
from wagtail.admin import urls as wagtailadmin_urls

urlpatterns = [path("cms/", include(wagtailadmin_urls))]
