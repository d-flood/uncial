from django.urls import include, path

urlpatterns = [path("api/uncial/", include("uncial_wagtail.urls"))]
