from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from game.models import Room


class Command(BaseCommand):
    help = "Delete inactive game rooms after their retention window."

    def add_arguments(self, parser):
        parser.add_argument("--hours", type=int, default=24)

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(hours=options["hours"])
        deleted, _ = Room.objects.filter(updated_at__lt=cutoff).delete()
        self.stdout.write(self.style.SUCCESS(f"Removed {deleted} stale room records."))
