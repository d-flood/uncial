import os

import pytest

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "testproject.settings")


@pytest.fixture(scope="session")
def django_db_use_migrations():
    # The test project's apps ship without migration files; build tables
    # directly from the current model state instead.
    return False
