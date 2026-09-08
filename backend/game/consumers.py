from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .models import Room, RoomMember
from .views import room_payload


class RoomConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.code = self.scope["url_route"]["kwargs"]["code"].upper()
        self.group_name = f"room_{self.code}"
        user = self.scope["user"]
        if not user.is_authenticated or not await self.is_member(user.id):
            await self.close(code=4403)
            return
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_current_state()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def room_changed(self, event):
        await self.send_current_state()

    async def send_current_state(self):
        payload = await self.get_payload(self.scope["user"].id)
        if payload:
            await self.send_json(payload)

    @database_sync_to_async
    def is_member(self, user_id):
        return RoomMember.objects.filter(room__code=self.code, user_id=user_id).exists()

    @database_sync_to_async
    def get_payload(self, user_id):
        room = Room.objects.filter(code=self.code).first()
        if room is None:
            return None
        return room_payload(room, room.members.get(user_id=user_id).user)
