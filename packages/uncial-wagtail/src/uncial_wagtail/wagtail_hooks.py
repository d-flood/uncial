"""Wagtail hook module for future package-level admin integrations.

The Uncial editor assets are loaded through ``UncialWidget.Media`` so Django can
deduplicate them per form. Loading them here as global editor hooks would execute
the same bundle twice on page-edit views.
"""
