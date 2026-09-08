from django.urls import path
from . import views

urlpatterns = [
    path("auth/signup/", views.signup),
    path("auth/session/", views.session),
    path("rooms/", views.rooms),
    path("rooms/<str:code>/", views.get_room),
    path("rooms/<str:code>/join/", views.join_room),
    path("rooms/<str:code>/leave/", views.leave_room),
    path("rooms/<str:code>/approve/<int:user_id>/", views.approve_member),
    path("rooms/<str:code>/move/", views.move),
]
