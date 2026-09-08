from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def backfill_members(apps, schema_editor):
    Room = apps.get_model("game", "Room")
    RoomMember = apps.get_model("game", "RoomMember")
    for room in Room.objects.all():
        RoomMember.objects.get_or_create(room_id=room.id, user_id=room.host_id, defaults={"status": "approved"})
        if room.guest_id:
            RoomMember.objects.get_or_create(room_id=room.id, user_id=room.guest_id, defaults={"status": "approved"})


class Migration(migrations.Migration):
    dependencies = [("game", "0001_initial")]

    operations = [
        migrations.CreateModel(
            name="RoomMember",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("pending", "Pending"), ("approved", "Approved")], default="pending", max_length=8)),
                ("joined_at", models.DateTimeField(auto_now_add=True)),
                ("room", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="members", to="game.room")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="room_memberships", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddConstraint(
            model_name="roommember",
            constraint=models.UniqueConstraint(fields=("room", "user"), name="unique_room_member"),
        ),
        migrations.RunPython(backfill_members, migrations.RunPython.noop),
        migrations.RemoveField(model_name="room", name="guest"),
    ]