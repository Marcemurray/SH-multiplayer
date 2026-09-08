import json
from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from .engine import add_player, new_game, pickup, play_card, public_state
from .models import Room, RoomMember


def body_of(request):
    try:
        return json.loads(request.body or "{}")
    except json.JSONDecodeError as error:
        raise ValueError("Invalid JSON.") from error


def auth_required(view):
    def wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Sign in to continue."}, status=401)
        return view(request, *args, **kwargs)
    return wrapped


def room_for_user(code, user, lock=False):
    rooms = Room.objects.select_for_update() if lock else Room.objects
    room = rooms.filter(code=code.upper()).first()
    if room is None or not room.members.filter(user=user, status="approved").exists():
        return None
    return room


def room_payload(room, user):
    members = list(room.members.filter(status="approved").select_related("user").order_by("joined_at"))
    pending = list(room.members.filter(status="pending").select_related("user").order_by("joined_at"))
    membership = room.members.filter(user=user).first()
    payload = {
        "code": room.code,
        "status": room.status,
        "host": room.host.username,
        "players": [member.user.username for member in members],
        "pending": [{"id": member.user_id, "name": member.user.username} for member in pending] if room.host_id == user.id else [],
    }
    if membership and membership.status == "pending":
        payload["status"] = "pending"
    elif room.status == "playing":
        viewer_index = next(index for index, member in enumerate(members) if member.user_id == user.id)
        payload["game"] = public_state(room.state, viewer_index)
    return payload


def notify_room(code):
    async_to_sync(get_channel_layer().group_send)(f"room_{code}", {"type": "room.changed"})


def cleanup_stale_rooms():
    Room.objects.filter(updated_at__lt=timezone.now() - timedelta(hours=24)).delete()


@csrf_exempt
def signup(request):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    try:
        data = body_of(request)
        username, password = data.get("username", "").strip(), data.get("password", "")
        if len(username) < 3 or len(password) < 6:
            raise ValueError("Use at least 3 characters for your name and 6 for your password.")
        if User.objects.filter(username__iexact=username).exists():
            raise ValueError("That player name is already taken.")
        user = User.objects.create_user(username=username, password=password)
        login(request, user)
        return JsonResponse({"username": user.username}, status=201)
    except ValueError as error:
        return JsonResponse({"error": str(error)}, status=400)


@csrf_exempt
def session(request):
    if request.method == "GET":
        return JsonResponse({"username": request.user.username if request.user.is_authenticated else None})
    if request.method == "DELETE":
        logout(request)
        return JsonResponse({"ok": True})
    if request.method == "POST":
        try:
            data = body_of(request)
            user = authenticate(request, username=data.get("username", ""), password=data.get("password", ""))
            if user is None:
                raise ValueError("Player name or password is incorrect.")
            login(request, user)
            return JsonResponse({"username": user.username})
        except ValueError as error:
            return JsonResponse({"error": str(error)}, status=400)
    return JsonResponse({"error": "Method not allowed"}, status=405)


@csrf_exempt
@auth_required
def rooms(request):
    if request.method == "GET":
        cleanup_stale_rooms()
        candidates = Room.objects.filter(status__in=("waiting", "playing")).prefetch_related("members").order_by("-created_at")
        available = []
        for room in candidates:
            player_count = sum(member.status == "approved" for member in room.members.all())
            if player_count < 4:
                available.append({"code": room.code, "host": room.host.username, "player_count": player_count, "in_progress": room.status == "playing"})
            if len(available) == 30:
                break
        return JsonResponse({"rooms": available})
    if request.method == "POST":
        cleanup_stale_rooms()
        room = Room.objects.create(host=request.user)
        RoomMember.objects.create(room=room, user=request.user, status="approved")
        return JsonResponse(room_payload(room, request.user), status=201)
    return JsonResponse({"error": "Method not allowed"}, status=405)


@csrf_exempt
@auth_required
def join_room(request, code):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    with transaction.atomic():
        room = Room.objects.select_for_update().filter(code=code.upper()).first()
        if room is None:
            return JsonResponse({"error": "Room not found."}, status=404)
        if room.host_id == request.user.id:
            return JsonResponse(room_payload(room, request.user))
        member, created = RoomMember.objects.get_or_create(room=room, user=request.user)
        if not created and member.status == "approved":
            return JsonResponse(room_payload(room, request.user))
        if room.members.filter(status="approved").count() >= 4:
            return JsonResponse({"error": "That room is full."}, status=409)
        member.status = "pending"
        member.save(update_fields=["status"])
        room.save(update_fields=["updated_at"])
        transaction.on_commit(lambda: notify_room(room.code))
    return JsonResponse({"code": room.code, "status": "pending", "message": "Join request sent to the host."})


@csrf_exempt
@auth_required
def approve_member(request, code, user_id):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    with transaction.atomic():
        room = Room.objects.select_for_update().filter(code=code.upper(), host=request.user).first()
        if room is None:
            return JsonResponse({"error": "Room not found."}, status=404)
        member = room.members.filter(user_id=user_id, status="pending").first()
        if member is None:
            return JsonResponse({"error": "Join request not found."}, status=404)
        if room.members.filter(status="approved").count() >= 4:
            return JsonResponse({"error": "That room is full."}, status=409)
        member.status = "approved"
        member.save(update_fields=["status"])
        approved = list(room.members.filter(status="approved").select_related("user").order_by("joined_at"))
        if len(approved) >= 2 and room.status == "waiting":
            room.status = "playing"
            room.state = new_game(tuple(member.user.username for member in approved))
            room.save(update_fields=["status", "state"])
        elif room.status == "playing":
            add_player(room.state, member.user.username)
            room.save(update_fields=["state"])
        transaction.on_commit(lambda: notify_room(room.code))
    return JsonResponse(room_payload(room, request.user))


@auth_required
def get_room(request, code):
    room = room_for_user(code, request.user)
    if room is None:
        room = Room.objects.filter(code=code.upper(), members__user=request.user, members__status="pending").first()
    if room is None:
        return JsonResponse({"error": "Room not found."}, status=404)
    return JsonResponse(room_payload(room, request.user))


@csrf_exempt
@auth_required
def move(request, code):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    try:
        data = body_of(request)
        with transaction.atomic():
            room = room_for_user(code, request.user, lock=True)
            if room is None:
                return JsonResponse({"error": "Room not found."}, status=404)
            if room.status != "playing":
                raise ValueError("The game has not started yet.")
            approved = list(room.members.filter(status="approved").select_related("user").order_by("joined_at"))
            player_index = next(index for index, member in enumerate(approved) if member.user_id == request.user.id)
            if data.get("action") == "play":
                play_card(room.state, player_index, data.get("card_id"))
            elif data.get("action") == "pickup":
                pickup(room.state, player_index)
            else:
                raise ValueError("Unknown move.")
            room.save(update_fields=["state"])
            transaction.on_commit(lambda: notify_room(room.code))
        return JsonResponse(room_payload(room, request.user))
    except ValueError as error:
        return JsonResponse({"error": str(error)}, status=400)
