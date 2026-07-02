from django.http import JsonResponse
from django.shortcuts import redirect
from django.shortcuts import get_object_or_404
from wagtail.models import Page

from .serializers import serialize_page


def page_detail(request, page_id: int):
    page = get_object_or_404(Page.objects.live().public().specific(), id=page_id)
    return JsonResponse(serialize_page(page))


def _forbidden_response():
    return JsonResponse({"error": "You do not have permission to choose images."}, status=403)


def image_chooser_fallback(request):
    from wagtail.images.permissions import permission_policy

    if not permission_policy.user_has_any_permission(request.user, ["choose"]):
        return _forbidden_response()

    raw_image_id = request.GET.get("id")
    image_id = None
    if raw_image_id not in (None, ""):
        try:
            image_id = int(raw_image_id)
        except ValueError:
            return JsonResponse({"error": "Invalid image id."}, status=400)

    queryset = permission_policy.instances_user_has_any_permission_for(
        request.user, ["choose"]
    ).order_by("title")
    images = queryset.filter(id=image_id) if image_id is not None else queryset[:50]

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
    from wagtail.images.permissions import permission_policy

    if not permission_policy.user_has_any_permission(request.user, ["choose"]):
        return _forbidden_response()

    queryset = permission_policy.instances_user_has_any_permission_for(request.user, ["choose"])
    image = get_object_or_404(queryset, id=image_id)
    return redirect(image.get_rendition("fill-900x600").url)
