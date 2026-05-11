from django.db import models


def uncial_body_field() -> models.JSONField:
    return models.JSONField(default=dict, blank=True)
