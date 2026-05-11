from django.http import JsonResponse
from django.shortcuts import redirect
from django.shortcuts import get_object_or_404
from wagtail.models import Page

from .serializers import serialize_page


def page_detail(request, page_id: int):
    page = get_object_or_404(Page.objects.live().public().specific(), id=page_id)
    return JsonResponse(serialize_page(page))


def image_chooser_fallback(request):
    from wagtail.images import get_image_model

    image_id = request.GET.get("id")
    queryset = get_image_model().objects.order_by("title")
    images = queryset.filter(id=image_id) if image_id else queryset[:50]

    def serialize_image(image):
        rendition = image.get_rendition("fill-600x400")
        return {
            "id": image.id,
            "title": image.title,
            "previewUrl": rendition.url,
            "width": image.width,
            "height": image.height,
        }

    return JsonResponse(
        {
            "images": [serialize_image(image) for image in images]
        }
    )


def image_preview(request, image_id: int):
    from wagtail.images import get_image_model

    image = get_object_or_404(get_image_model(), id=image_id)
    return redirect(image.get_rendition("fill-900x600").url)
