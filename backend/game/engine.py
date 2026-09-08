import random

RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
SUITS = ["clubs", "diamonds", "hearts", "spades"]
RANK_VALUE = {rank: index for index, rank in enumerate(RANKS)}
def new_game(names=("Player 1", "Player 2")):
    deck = [{"id": f"{rank}-{suit}", "rank": rank, "suit": suit} for suit in SUITS for rank in RANKS]
    random.shuffle(deck)
    players = []
    for name in names:
        face_down = [deck.pop() for _ in range(3)]
        face_up = [deck.pop() for _ in range(3)]
        hand = sorted([deck.pop() for _ in range(3)], key=card_sort)
        players.append({"name": name, "hand": hand, "face_up": face_up, "face_down": face_down})
    game = {
        "players": players,
        "deck": deck,
        "pile": [],
        "turn": 0,
        "winner": None,
        "message": f"{names[0]} goes first.",
        "move_seq": 0,
        "last_move": None,
    }
    return game


def add_player(game, name):
    player = {
        "name": name,
        "hand": sorted([game["deck"].pop() for _ in range(3)], key=card_sort),
        "face_up": [game["deck"].pop() for _ in range(3)],
        "face_down": [game["deck"].pop() for _ in range(3)],
    }
    game["players"].append(player)


def card_sort(card):
    return (RANK_VALUE[card["rank"]], SUITS.index(card["suit"]))


def active_zone(player):
    if player["hand"]:
        return "hand"
    if player["face_up"]:
        return "face_up"
    return "face_down"


def effective_top(pile):
    for card in reversed(pile):
        if card["rank"] != "2":
            return card
    return None


def can_play(card, pile):
    if not pile or card["rank"] in ("2", "10"):
        return True
    top = effective_top(pile)
    if top is None:
        return True
    if top["rank"] == "7":
        return RANK_VALUE[card["rank"]] <= RANK_VALUE["7"]
    return RANK_VALUE[card["rank"]] >= RANK_VALUE[top["rank"]]


def refill(game, player):
    while len(player["hand"]) < 3 and game["deck"]:
        player["hand"].append(game["deck"].pop())
    player["hand"].sort(key=card_sort)


def is_burn(game, card):
    return card["rank"] == "10" or (
        len(game["pile"]) >= 4
        and len({c["rank"] for c in game["pile"][-4:]}) == 1
    )


def has_won(player):
    return not player["hand"] and not player["face_up"] and not player["face_down"]


def record_move(game, player, action, card=None, power=None, count=None):
    game["move_seq"] = game.get("move_seq", 0) + 1
    game["last_move"] = {
        "seq": game["move_seq"],
        "player": player["name"],
        "action": action,
        "card": card,
        "power": power,
        "count": count,
    }


def play_card(game, player_index, card_id):
    if game["winner"] is not None or game["turn"] != player_index:
        raise ValueError("It is not your turn.")
    player = game["players"][player_index]
    zone = active_zone(player)
    cards = player[zone]
    if zone == "face_down" and isinstance(card_id, str) and card_id.startswith("face-down-"):
        try:
            card = cards[int(card_id.rsplit("-", 1)[1])]
        except (ValueError, IndexError):
            card = None
    else:
        card = next((item for item in cards if item["id"] == card_id), None)
    if card is None:
        raise ValueError("That card is not available.")

    cards.remove(card)
    if zone == "face_down" and not can_play(card, game["pile"]):
        picked_up = len(game["pile"]) + 1
        player["hand"].extend(game["pile"] + [card])
        player["hand"].sort(key=card_sort)
        game["pile"] = []
        game["message"] = f"{player['name']} flipped {card['rank']} and picked up {picked_up} cards."
        game["turn"] = (player_index + 1) % len(game["players"])
        record_move(game, player, "blind_pickup", card=card, count=picked_up)
        return
    if not can_play(card, game["pile"]):
        cards.append(card)
        if zone == "hand":
            cards.sort(key=card_sort)
        raise ValueError("That card cannot be played on the pile.")

    if card["rank"] == "2":
        game["pile"] = []
    game["pile"].append(card)
    burned = is_burn(game, card)
    power = "reset" if card["rank"] == "2" else "low" if card["rank"] == "7" else "burn" if card["rank"] == "10" else "quad" if burned else None
    refill(game, player)
    if has_won(player):
        game["winner"] = player_index
        game["message"] = f"{player['name']} is out of cards!"
        record_move(game, player, "play", card=card, power=power)
        return
    if burned:
        game["pile"] = []
        game["message"] = f"{player['name']} burned the pile with {card['rank']} and plays again."
        record_move(game, player, "play", card=card, power=power)
        return
    game["turn"] = (player_index + 1) % len(game["players"])
    game["message"] = f"{player['name']} played {card['rank']}."
    record_move(game, player, "play", card=card, power=power)


def pickup(game, player_index):
    if game["winner"] is not None or game["turn"] != player_index:
        raise ValueError("It is not your turn.")
    if not game["pile"]:
        raise ValueError("There is no pile to pick up.")
    player = game["players"][player_index]
    count = len(game["pile"])
    player["hand"].extend(game["pile"])
    player["hand"].sort(key=card_sort)
    game["pile"] = []
    game["turn"] = (player_index + 1) % len(game["players"])
    game["message"] = f"{player['name']} picked up {count} cards."
    record_move(game, player, "pickup", count=count)


def public_state(game, viewer_index):
    you = game["players"][viewer_index]
    opponents = [player for index, player in enumerate(game["players"]) if index != viewer_index]
    zone = active_zone(you)
    visible_cards = you[zone]
    legal_ids = [card["id"] for card in visible_cards if zone == "face_down" or can_play(card, game["pile"])]
    return {
        "deck_count": len(game["deck"]),
        "pile_count": len(game["pile"]),
        "top_card": game["pile"][-1] if game["pile"] else None,
        "your_turn": game["turn"] == viewer_index,
        "winner": None if game["winner"] is None else ("you" if game["winner"] == viewer_index else "opponent"),
        "winner_name": None if game["winner"] is None else game["players"][game["winner"]]["name"],
        "current_player": game["players"][game["turn"]]["name"],
        "move_seq": game.get("move_seq", 0),
        "last_move": game.get("last_move"),
        "message": game["message"],
        "legal_ids": legal_ids,
        "you": {
            "name": you["name"], "hand": you["hand"], "face_up": you["face_up"],
            "face_down_count": len(you["face_down"]), "active_zone": zone,
        },
        "opponents": [{
            "name": opponent["name"], "hand_count": len(opponent["hand"]), "face_up": opponent["face_up"],
            "face_down_count": len(opponent["face_down"]), "active_zone": active_zone(opponent),
        } for opponent in opponents],
    }
