from django.urls import path

from . import views

app_name = "uncial_wagtail"

urlpatterns = [
    path("pages/<int:page_id>/", views.page_detail, name="page_detail"),
    path("images/", views.image_chooser_fallback, name="image_chooser_fallback"),
    path("images/<int:image_id>/preview/", views.image_preview, name="image_preview"),
]
