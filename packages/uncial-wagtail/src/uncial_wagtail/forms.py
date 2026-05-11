from django import forms

from .widgets import UncialWidget


class UncialJSONFormField(forms.JSONField):
    widget = UncialWidget
