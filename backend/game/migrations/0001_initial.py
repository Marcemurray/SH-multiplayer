from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import game.models


class Migration(migrations.Migration):
    initial = True
    dependencies = [("auth", "0012_alter_user_first_name_max_length")]
    operations = [
        migrations.CreateModel(
            name="Room",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(default=game.models.room_code, max_length=5, unique=True)),
                ("state", models.JSONField(blank=True, default=dict)),
                ("status", models.CharField(default="waiting", max_length=12)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("guest", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="joined_rooms", to=settings.AUTH_USER_MODEL)),
                ("host", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="hosted_rooms", to=settings.AUTH_USER_MODEL)),
            ],
        )
    ]
