from django.urls import path

from game.consumers import RoomConsumer

websocket_urlpatterns = [path("ws/rooms/<str:code>/", RoomConsumer.as_asgi())]
