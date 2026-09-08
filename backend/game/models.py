import secrets
import string

from django.contrib.auth.models import User
from django.db import models


def room_code():
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(5))


class Room(models.Model):
    code = models.CharField(max_length=5, unique=True, default=room_code)
    host = models.ForeignKey(User, on_delete=models.CASCADE, related_name="hosted_rooms")
    state = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=12, default="waiting")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class RoomMember(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="room_memberships")
    status = models.CharField(max_length=8, choices=[("pending", "Pending"), ("approved", "Approved")], default="pending")
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["room", "user"], name="unique_room_member")]
