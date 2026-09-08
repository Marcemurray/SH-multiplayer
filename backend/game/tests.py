import json

from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import User
from django.test import Client, TestCase, TransactionTestCase

from config.asgi import application

from .engine import can_play, new_game, pickup, play_card
from .models import Room


class RuleTests(TestCase):
    def card(self, rank, suit="clubs"):
        return {"id": f"{rank}-{suit}", "rank": rank, "suit": suit}

    def test_standard_play_must_be_equal_or_higher(self):
        pile = [self.card("8")]
        self.assertTrue(can_play(self.card("Q"), pile))
        self.assertFalse(can_play(self.card("6"), pile))

    def test_seven_forces_low_card(self):
        pile = [self.card("7")]
        self.assertTrue(can_play(self.card("5"), pile))
        self.assertFalse(can_play(self.card("9"), pile))

    def test_two_and_ten_are_always_legal(self):
        pile = [self.card("A")]
        self.assertTrue(can_play(self.card("2"), pile))
        self.assertTrue(can_play(self.card("10"), pile))

    def test_two_resets_pile_to_the_played_card(self):
        game = new_game()
        game["players"][0]["hand"] = [self.card("2"), self.card("4"), self.card("5")]
        game["pile"] = [self.card("9"), self.card("J"), self.card("K")]
        play_card(game, 0, "2-clubs")
        self.assertEqual(game["pile"], [self.card("2")])
        self.assertEqual(game["last_move"]["power"], "reset")

    def test_pickup_moves_pile_to_hand_and_ends_turn(self):
        game = new_game()
        game["deck"] = []
        game["pile"] = [self.card("K")]
        original = len(game["players"][0]["hand"])
        pickup(game, 0)
        self.assertEqual(len(game["players"][0]["hand"]), original + 1)
        self.assertEqual(game["turn"], 1)

    def test_ten_burns_and_keeps_turn(self):
        game = new_game()
        game["deck"] = []
        game["players"][0]["hand"] = [self.card("10")]
        game["players"][0]["face_up"] = [self.card("3")]
        game["pile"] = [self.card("A")]
        play_card(game, 0, "10-clubs")
        self.assertEqual(game["pile"], [])
        self.assertEqual(game["turn"], 0)

    def test_play_refills_hand_while_deck_has_cards(self):
        game = new_game()
        game["players"][0]["hand"] = [self.card("3"), self.card("4"), self.card("5")]
        game["pile"] = []
        play_card(game, 0, "3-clubs")
        self.assertEqual(len(game["players"][0]["hand"]), 3)
        self.assertEqual(len(game["deck"]), 33)

    def test_hand_reduces_after_deck_is_empty(self):
        game = new_game()
        game["deck"] = []
        game["players"][0]["hand"] = [self.card("3"), self.card("4"), self.card("5")]
        game["pile"] = []
        play_card(game, 0, "3-clubs")
        self.assertEqual(len(game["players"][0]["hand"]), 2)


class MultiplayerTests(TestCase):
    def signup(self, client, username):
        return client.post(
            "/api/auth/signup/",
            data=json.dumps({"username": username, "password": "cards123"}),
            content_type="application/json",
        )

    def guest(self, client, username):
        return client.post(
            "/api/auth/session/",
            data=json.dumps({"username": username}),
            content_type="application/json",
        )

    def test_guest_can_start_with_only_a_player_name(self):
        client = Client()
        response = self.guest(client, "Quick Player")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["username"], "Quick Player")
        self.assertEqual(client.get("/api/auth/session/").json()["username"], "Quick Player")
        self.assertFalse(User.objects.get(first_name="Quick Player").has_usable_password())

    def test_guest_display_name_is_used_in_rooms(self):
        client = Client()
        self.guest(client, "Card Shark")

        room = client.post("/api/rooms/", data="{}", content_type="application/json").json()

        self.assertEqual(room["host"], "Card Shark")
        self.assertEqual(room["players"], ["Card Shark"])

    def test_two_accounts_join_one_room_with_private_views(self):
        host, guest = Client(), Client()
        self.assertEqual(self.signup(host, "marcel").status_code, 201)
        self.assertEqual(self.signup(guest, "friend").status_code, 201)
        room = host.post("/api/rooms/", data="{}", content_type="application/json").json()
        requested = guest.post(f"/api/rooms/{room['code']}/join/", data="{}", content_type="application/json").json()
        self.assertEqual(requested["status"], "pending")
        guest_user = User.objects.get(username="friend")
        host.post(f"/api/rooms/{room['code']}/approve/{guest_user.id}/", data="{}", content_type="application/json")
        joined = guest.get(f"/api/rooms/{room['code']}/").json()
        host_view = host.get(f"/api/rooms/{room['code']}/").json()

        self.assertEqual(joined["status"], "playing")
        self.assertEqual(host_view["game"]["you"]["name"], "marcel")
        self.assertEqual(joined["game"]["you"]["name"], "friend")
        self.assertNotIn("hand", host_view["game"]["opponents"][0])
        self.assertTrue(host_view["game"]["your_turn"])
        self.assertFalse(joined["game"]["your_turn"])

    def test_unauthenticated_player_cannot_create_room(self):
        response = Client().post("/api/rooms/", data="{}", content_type="application/json")
        self.assertEqual(response.status_code, 401)

    def test_authenticated_players_can_discover_waiting_rooms(self):
        host, guest = Client(), Client()
        self.assertEqual(self.signup(host, "tablehost").status_code, 201)
        self.assertEqual(self.signup(guest, "tableguest").status_code, 201)
        room = host.post("/api/rooms/", data="{}", content_type="application/json").json()

        response = guest.get("/api/rooms/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["rooms"][0]["code"], room["code"])

    def test_room_stays_discoverable_and_host_sees_requests_after_game_starts(self):
        host, second, third = Client(), Client(), Client()
        for client, name in ((host, "openhost"), (second, "player2"), (third, "player3")):
            self.assertEqual(self.signup(client, name).status_code, 201)
        room = host.post("/api/rooms/", data="{}", content_type="application/json").json()
        code = room["code"]
        second.post(f"/api/rooms/{code}/join/", data="{}", content_type="application/json")
        second_user = User.objects.get(username="player2")
        host.post(f"/api/rooms/{code}/approve/{second_user.id}/", data="{}", content_type="application/json")

        open_rooms = third.get("/api/rooms/").json()["rooms"]
        self.assertIn(code, [item["code"] for item in open_rooms])
        third.post(f"/api/rooms/{code}/join/", data="{}", content_type="application/json")
        host_view = host.get(f"/api/rooms/{code}/").json()
        self.assertEqual(host_view["pending"][0]["name"], "player3")

    def test_third_player_receives_their_view_and_can_move(self):
        host, second, third = Client(), Client(), Client()
        for client, name in ((host, "hoster"), (second, "second"), (third, "third")):
            self.assertEqual(self.signup(client, name).status_code, 201)
        created = host.post("/api/rooms/", data="{}", content_type="application/json").json()
        code = created["code"]
        for client, name in ((second, "second"), (third, "third")):
            client.post(f"/api/rooms/{code}/join/", data="{}", content_type="application/json")
            user = User.objects.get(username=name)
            host.post(f"/api/rooms/{code}/approve/{user.id}/", data="{}", content_type="application/json")

        room = Room.objects.get(code=code)
        room.state["turn"] = 2
        room.state["pile"] = []
        room.save(update_fields=["state"])
        third_view = third.get(f"/api/rooms/{code}/").json()
        card_id = third_view["game"]["legal_ids"][0]
        moved = third.post(
            f"/api/rooms/{code}/move/",
            data=json.dumps({"action": "play", "card_id": card_id}),
            content_type="application/json",
        )

        self.assertEqual(third_view["game"]["you"]["name"], "third")
        self.assertEqual(third_view["game"]["current_player"], "third")
        self.assertEqual(moved.status_code, 200)


class WebsocketTests(TransactionTestCase):
    reset_sequences = True

    def test_authenticated_room_member_receives_personalized_state(self):
        client = Client()
        client.post(
            "/api/auth/signup/",
            data=json.dumps({"username": "socketuser", "password": "cards123"}),
            content_type="application/json",
        )
        room = client.post("/api/rooms/", data="{}", content_type="application/json").json()
        cookie = client.cookies["sessionid"].value

        async def communicate():
            websocket = WebsocketCommunicator(
                application,
                f"/ws/rooms/{room['code']}/",
                headers=[(b"cookie", f"sessionid={cookie}".encode())],
            )
            connected, _ = await websocket.connect()
            payload = await websocket.receive_json_from()
            await websocket.disconnect()
            return connected, payload

        connected, payload = async_to_sync(communicate)()
        self.assertTrue(connected)
        self.assertEqual(payload["code"], room["code"])
        self.assertEqual(payload["host"], "socketuser")
