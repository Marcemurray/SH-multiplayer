from pathlib import Path

from django.conf import settings
from django.http import FileResponse
from django.urls import include, path, re_path


def frontend(request):
    index = Path(settings.BASE_DIR) / "static_frontend" / "index.html"
    if not index.exists():
        return FileResponse(open(Path(settings.BASE_DIR).parent / "frontend" / "dist" / "index.html", "rb"))
    return FileResponse(open(index, "rb"))

urlpatterns = [path("api/", include("game.urls")), re_path(r"^(?!api/|static/).*$", frontend)]
