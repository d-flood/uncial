from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from wagtail.models import Page, Site

from pages.models import DemoArticlePage, HomePage


class Command(BaseCommand):
    help = "Create a local admin user and sample Uncial Wagtail pages."

    def handle(self, *args, **options):
        user_model = get_user_model()
        if not user_model.objects.filter(username="admin").exists():
            user_model.objects.create_superuser("admin", "admin@example.com", "admin")

        root = Page.get_first_root_node()
        home = HomePage.objects.first()
        if home is None:
            root.get_children().filter(slug="home").delete()
            home = HomePage(title="Uncial Wagtail Demo", slug="home", intro="Try editing the article page.")
            root.add_child(instance=home)  # pyright: ignore[reportCallIssue]
            home.save_revision().publish()  # pyright: ignore[reportCallIssue, reportAttributeAccessIssue]

        site, _created = Site.objects.get_or_create(
            is_default_site=True,
            defaults={"hostname": "localhost", "port": 8000, "root_page": home},
        )
        site.root_page = home
        site.hostname = "localhost"
        site.port = 8000
        site.save()

        if DemoArticlePage.objects.filter(slug="demo-article").exists():
            self.stdout.write("Demo already seeded.")
            return

        article = DemoArticlePage(
            title="Demo article",
            slug="demo-article",
            summary="A sample page using a JSONField-backed Uncial body.",
            body={
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {"type": "text", "text": "Edit this JSON body with the Uncial panel."}
                        ],
                    }
                ],
            },
        )
        home.add_child(instance=article)  # pyright: ignore[reportCallIssue]
        article.save_revision().publish()  # pyright: ignore[reportCallIssue, reportAttributeAccessIssue]
        self.stdout.write("Created admin/admin and demo content.")
