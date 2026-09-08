import json
import uuid
from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import login, logout
from django.contrib.auth.models import User
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from .engine import add_player, new_game, pickup, play_card, public_state, remove_player
from .models import Room, RoomMember


def body_of(request):
    try:
        return json.loads(request.body or "{}")
    except json.JSONDecodeError as error:
        raise ValueError("Invalid JSON.") from error


def player_name(user):
    return user.first_name or user.username


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
        "host": player_name(room.host),
        "players": [player_name(member.user) for member in members],
        "pending": [{"id": member.user_id, "name": player_name(member.user)} for member in pending] if room.host_id == user.id else [],
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
        return JsonResponse({"username": player_name(request.user) if request.user.is_authenticated else None})
    if request.method == "DELETE":
        logout(request)
        return JsonResponse({"ok": True})
    if request.method == "POST":
        try:
            data = body_of(request)
            name = data.get("username", "").strip()
            if not 2 <= len(name) <= 20:
                raise ValueError("Choose a name between 2 and 20 characters.")
            if not all(character.isalnum() or character in " _-" for character in name):
                raise ValueError("Use letters, numbers, spaces, dashes, or underscores.")
            user = User(username=f"guest_{uuid.uuid4().hex}", first_name=name)
            user.set_unusable_password()
            user.save()
            login(request, user)
            return JsonResponse({"username": player_name(user)}, status=201)
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
                available.append({"code": room.code, "host": player_name(room.host), "player_count": player_count, "in_progress": room.status == "playing"})
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
        approved_members = room.members.filter(status="approved").select_related("user")
        if any(player_name(item.user).casefold() == player_name(request.user).casefold() for item in approved_members):
            return JsonResponse({"error": "Someone at that table is already using that name."}, status=409)
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
def leave_room(request, code):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    with transaction.atomic():
        room = Room.objects.select_for_update().filter(code=code.upper()).first()
        if room is None:
            return JsonResponse({"ok": True})
        member = room.members.filter(user=request.user).first()
        if member is None:
            return JsonResponse({"ok": True})
        was_approved = member.status == "approved"
        approved = list(room.members.filter(status="approved").select_related("user").order_by("joined_at"))
        player_index = next((index for index, item in enumerate(approved) if item.user_id == request.user.id), None)
        member.delete()
        remaining = list(room.members.filter(status="approved").order_by("joined_at"))
        if not remaining:
            room.delete()
        else:
            update_fields = ["updated_at"]
            if room.host_id == request.user.id:
                room.host = remaining[0].user
                update_fields.append("host")
            if was_approved and room.status == "playing":
                if len(remaining) < 2:
                    room.status = "waiting"
                    room.state = {}
                    update_fields.extend(["status", "state"])
                elif player_index is not None:
                    remove_player(room.state, player_index)
                    update_fields.append("state")
            room.save(update_fields=update_fields)
        transaction.on_commit(lambda: notify_room(code.upper()))
    return JsonResponse({"ok": True})


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
            room.state = new_game(tuple(player_name(member.user) for member in approved))
            room.save(update_fields=["status", "state"])
        elif room.status == "playing":
            add_player(room.state, player_name(member.user))
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
