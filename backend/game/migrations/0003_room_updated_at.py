from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("game", "0002_roommember")]
    operations = [migrations.AddField(model_name="room", name="updated_at", field=models.DateTimeField(auto_now=True))]
