# SH-multiplayer

A real-time browser version of the pub card game for two to four players. Pick a player name, open or discover a room, approve new players, and play from separate browsers with animated cards, sound, and comic-style power effects.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Marcemurray/SH-multiplayer)

## Highlights

- Password-free guest sessions with private and discoverable multiplayer rooms
- Live WebSocket state with automatic reconnect and polling fallback
- Responsive card table for desktop and mobile browsers
- Server-authoritative turns, legal moves, hidden cards, and win state
- Spatial card and pile animations synchronized across players
- Docker deployment with SQLite locally or PostgreSQL in production

## Rules in this MVP

- Play a card equal to or higher than the top card.
- `2` resets the pile, `7` forces the next play to be `7` or lower, and `10` burns the pile.
- Four cards of the same rank in a row also burn the pile.
- If you cannot play, pick up the pile.
- Draw back up to three cards after each play while the deck has cards. Once the deck is empty, hands begin shrinking.
- After your hand is empty, play face-up cards, then choose face-down cards blindly.
- The first player to get rid of every card wins.

## Run locally

Backend (PowerShell):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Frontend, in a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The Vite development server proxies `/api` to Django at port 8000.

For a local multiplayer test, use a normal and private browser window so each player has a separate login session.

## Production

The root `Dockerfile` builds React and runs Django through Daphne with WebSocket support. `compose.yaml` adds Redis for room broadcasts, a persistent SQLite volume, and hourly stale-room cleanup.

For a free hosted deployment, create a Neon PostgreSQL project and copy its pooled connection string. Then use the Render button above and enter that connection string when Render prompts for `DATABASE_URL`. The included `render.yaml` creates a free Docker web service, generates the Django secret automatically, and configures Render's HTTPS hostname. Do not commit the database connection string.

The free Render service runs as a single instance, so it can omit Redis and use the built-in channel layer. Free instances sleep during inactivity and may take a little while to respond to the first request. Stale rooms are cleaned opportunistically and can also be removed with `python manage.py cleanup_rooms --hours 24`.

## Stack

React, Vite, Django, Channels, Daphne, PostgreSQL/SQLite, Redis, and Docker.


## Deployed app:

For demo purposes here is the deployed app: https://sh-multiplayer.onrender.com