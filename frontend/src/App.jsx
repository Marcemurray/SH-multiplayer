import { useEffect, useRef, useState } from "react";
import { Check, Copy, DoorOpen, Flame, Hand, Layers3, LogOut, Plus, UserPlus, Volume2, VolumeX } from "lucide-react";

const suitMarks = { clubs: "\u2663", diamonds: "\u2666", hearts: "\u2665", spades: "\u2660" };

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function playSound(kind, audioContextRef) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = audioContextRef.current || new AudioContext();
  audioContextRef.current = context;
  if (context.state === "suspended") context.resume();
  const now = context.currentTime;
  const notes = kind === "win" ? [523, 659, 784] : kind === "burn" ? [180, 110] : [kind === "pickup" ? 150 : 290];
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === "burn" ? "sawtooth" : "sine";
    oscillator.frequency.setValueAtTime(frequency, now + index * 0.09);
    gain.gain.setValueAtTime(0.0001, now + index * 0.09);
    gain.gain.exponentialRampToValueAtTime(kind === "win" ? 0.09 : 0.055, now + index * 0.09 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.09 + 0.16);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + index * 0.09);
    oscillator.stop(now + index * 0.09 + 0.18);
  });
}

function Card({ card, hidden = false, disabled = false, onClick, small = false }) {
  const red = card && ["diamonds", "hearts"].includes(card.suit);
  return <button className={`card ${hidden ? "card-back" : ""} ${red ? "red" : ""} ${small ? "small" : ""}`} disabled={disabled || hidden} onClick={onClick} aria-label={hidden ? "Face-down card" : `${card.rank} of ${card.suit}`}>
    {!hidden && <><span className="corner">{card.rank}<b>{suitMarks[card.suit]}</b></span><span className="suit">{suitMarks[card.suit]}</span></>}
  </button>;
}

function BackCards({ count, small = false }) {
  const visible = Math.min(count, 3);
  return <div className="card-row stacked">{Array.from({ length: visible }, (_, i) => <Card key={i} hidden small={small} />)}{count > 3 && <span className="count-badge">{count}</span>}</div>;
}

function AuthScreen({ onAuthenticated }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const data = await api("/api/auth/session/", { method: "POST", body: JSON.stringify({ username }) });
      onAuthenticated(data.username);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return <main className="entry-screen comic-entry"><section className="auth-panel">
    <span className="comic-kicker">No login. Just cards.</span>
    <div className="brand auth-brand"><span className="brand-mark brand-mark-large" role="img" aria-label="Shithead">{"\uD83D\uDCA9"}</span><div><h1>Shithead</h1><p>Pick a name and hit the table</p></div></div>
    <form onSubmit={submit}>
      <label>What do we call you?<input value={username} onChange={event => setUsername(event.target.value)} minLength="2" maxLength="20" autoComplete="nickname" autoFocus placeholder="Player name" required /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="primary-button comic-button" disabled={busy}>{busy ? "Shuffling..." : "Let's play"}</button>
    </form>
  </section></main>;
}

function Lobby({ username, onRoom, onLogout }) {
  const [code, setCode] = useState("");
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function loadRooms() { try { setRooms((await api("/api/rooms/")).rooms); } catch (err) { setError(err.message); } }
    loadRooms();
    const timer = window.setInterval(loadRooms, 2500);
    return () => window.clearInterval(timer);
  }, []);

  async function createRoom() {
    setBusy(true); setError("");
    try { onRoom(await api("/api/rooms/", { method: "POST", body: "{}" })); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function joinRoom(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { onRoom(await api(`/api/rooms/${code.trim().toUpperCase()}/join/`, { method: "POST", body: "{}" })); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function requestRoom(roomCode) {
    setBusy(true); setError("");
    try { onRoom(await api(`/api/rooms/${roomCode}/join/`, { method: "POST", body: "{}" })); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return <main className="entry-screen lobby-screen"><header className="lobby-header"><div className="brand"><span className="brand-mark" role="img" aria-label="Shithead">{"\uD83D\uDCA9"}</span><div><h1>Shithead</h1><p>Playing as {username}</p></div></div><button className="icon-button" onClick={onLogout} title="Change player"><LogOut size={19} /></button></header>
    <section className="lobby-panel"><div className="lobby-title"><span className="comic-kicker">Ready when you are</span><h2>Pick a table!</h2></div>
      <button className="room-action comic-action" onClick={createRoom} disabled={busy}><Plus size={22} /><span><strong>Create room</strong><small>Deal a fresh table</small></span></button>
      <div className="divider"><span>or join with a code</span></div>
      <form className="join-form" onSubmit={joinRoom}><input value={code} onChange={event => setCode(event.target.value.toUpperCase())} maxLength="5" placeholder="ABCDE" aria-label="Room code" required /><button className="primary-button" disabled={busy || code.length !== 5}><DoorOpen size={18} /> Join room</button></form>
      <div className="room-list"><div className="room-list-heading"><span>Open tables</span><small>{rooms.length} available</small></div>{rooms.length ? rooms.map(room => <div className="room-row" key={room.code}><div><strong>{room.code}</strong><small>{room.host}'s table · {room.player_count}/4 players{room.in_progress ? " · In progress" : ""}</small></div><button className="icon-button" onClick={() => requestRoom(room.code)} disabled={busy} title="Request to join"><UserPlus size={18} /></button></div>) : <p className="empty-list">No open tables yet.</p>}</div>
      {error && <p className="form-error">{error}</p>}
    </section></main>;
}

function GameRoom({ room, setRoom, soundOn, setSoundOn, onLeave }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [effect, setEffect] = useState("");
  const [moveAnimation, setMoveAnimation] = useState(null);
  const [showPreviousTop, setShowPreviousTop] = useState(false);
  const [connection, setConnection] = useState("connecting");
  const audioContextRef = useRef(null);
  const lastMoveRef = useRef(room.game?.move_seq || 0);
  const animationTimerRef = useRef(null);
  const pileSwapTimerRef = useRef(null);
  const pileTargetRef = useRef(null);
  const displayedGameRef = useRef(room.game);

  function animateMove(nextGame, suppliedSourceRect = null) {
    const moveEvent = nextGame?.last_move;
    if (!moveEvent || moveEvent.seq <= lastMoveRef.current) return;
    lastMoveRef.current = moveEvent.seq;
    const sourceElement = [...document.querySelectorAll("[data-player]")].find(element => element.dataset.player === moveEvent.player);
    const sourceRect = suppliedSourceRect || sourceElement?.getBoundingClientRect();
    const targetRect = pileTargetRef.current?.getBoundingClientRect();
    const previousTop = displayedGameRef.current?.top_card || null;
    const motion = sourceRect && targetRect ? {
      left: targetRect.left + targetRect.width / 2 - 38,
      top: targetRect.top + targetRect.height / 2 - 53,
      "--move-x": `${sourceRect.left + sourceRect.width / 2 - targetRect.left - targetRect.width / 2}px`,
      "--move-y": `${sourceRect.top + sourceRect.height / 2 - targetRect.top - targetRect.height / 2}px`,
    } : null;
    window.clearTimeout(animationTimerRef.current);
    window.clearTimeout(pileSwapTimerRef.current);
    setMoveAnimation({ ...moveEvent, motion, previousTop });
    setShowPreviousTop(moveEvent.action === "play");
    setEffect(moveEvent.power || "");
    if (soundOn) playSound(moveEvent.power === "burn" || moveEvent.power === "quad" ? "burn" : nextGame.winner ? "win" : moveEvent.action, audioContextRef);
    animationTimerRef.current = window.setTimeout(() => { setMoveAnimation(null); setEffect(""); }, 1650);
    pileSwapTimerRef.current = window.setTimeout(() => setShowPreviousTop(false), 800);
  }

  useEffect(() => {
    let socket;
    let reconnectTimer;
    let stopped = false;
    let retryDelay = 800;
    const receive = data => { animateMove(data.game); setRoom(data); setError(""); };
    const poll = async () => {
      if (socket?.readyState === WebSocket.OPEN) return;
      try { receive(await api(`/api/rooms/${room.code}/`)); } catch (err) { setError(err.message); }
    };
    const connect = () => {
      if (stopped) return;
      setConnection("connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/ws/rooms/${room.code}/`);
      socket.onopen = () => { retryDelay = 800; setConnection("live"); };
      socket.onmessage = event => receive(JSON.parse(event.data));
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (stopped) return;
        setConnection("reconnecting");
        reconnectTimer = window.setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 8000);
      };
    };
    connect();
    const pollTimer = window.setInterval(poll, 2500);
    return () => {
      stopped = true;
      socket?.close();
      window.clearInterval(pollTimer);
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(animationTimerRef.current);
      window.clearTimeout(pileSwapTimerRef.current);
    };
  }, [room.code]);

  async function move(action, cardId, sourceElement = null) {
    if (busy) return;
    const sourceRect = sourceElement?.getBoundingClientRect();
    if (soundOn && !audioContextRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioContextRef.current = new AudioContext();
    }
    setBusy(true); setError("");
    try {
      const data = await api(`/api/rooms/${room.code}/move/`, { method: "POST", body: JSON.stringify({ action, card_id: cardId }) });
      animateMove(data.game, sourceRect);
      setRoom(data);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function approvePlayer(playerId) {
    setBusy(true); setError("");
    try { setRoom(await api(`/api/rooms/${room.code}/approve/${playerId}/`, { method: "POST", body: "{}" })); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  if (room.status !== "playing") return <main className="entry-screen"><section className="waiting-panel"><span className="waiting-pulse" /><p className="eyebrow">{room.status === "pending" ? "Request sent" : "Room ready"}</p><h2>{room.code}</h2><p>{room.status === "pending" ? "Waiting for the host to approve your request" : "Share the code or approve players below"}</p><button className="copy-button" onClick={() => navigator.clipboard.writeText(room.code)}><Copy size={18} /> Copy room code</button>{room.pending?.map(player => <button className="approve-button" key={player.id} onClick={async () => setRoom(await api(`/api/rooms/${room.code}/approve/${player.id}/`, { method: "POST", body: "{}" }))}><Check size={17} /> Approve {player.name}</button>)}<button className="text-button" onClick={onLeave}>Back to lobby</button></section></main>;

  const game = room.game;
  displayedGameRef.current = game;
  const yourTurn = game.your_turn && game.winner === null;
  const activeCards = game.you[game.you.active_zone] || [];
  const faceDownActive = game.you.active_zone === "face_down";
  const powerLabels = { reset: "FRESH START!", low: "KEEP IT LOW!", burn: "KABOOM!", quad: "QUAD BURN!" };
  const moveFromYou = moveAnimation?.player === game.you.name;
  const displayedTopCard = showPreviousTop ? moveAnimation?.previousTop : game.top_card;

  return <main className="game-shell"><header><div className="brand"><span className="brand-mark" role="img" aria-label="Shithead">{"\uD83D\uDCA9"}</span><div><h1>Room {room.code}</h1><p>{room.players.join(" vs ")}</p></div></div><div className="header-actions"><span className={`connection-state ${connection}`}><i />{connection === "live" ? "Live" : "Reconnecting"}</span><button className="icon-button" onClick={() => setSoundOn(value => !value)} title={soundOn ? "Mute sounds" : "Turn sounds on"}>{soundOn ? <Volume2 size={19} /> : <VolumeX size={19} />}</button><button className="icon-button" onClick={onLeave} title="Leave table"><LogOut size={19} /></button></div></header>
    <section className={`table ${moveAnimation?.power ? `table-power-${moveAnimation.power}` : ""}`} aria-label="Card table">
      {!!room.pending?.length && <div className="join-requests"><span><UserPlus size={16} /> Join request</span>{room.pending.map(player => <button key={player.id} onClick={() => approvePlayer(player.id)} disabled={busy}><Check size={15} /> Add {player.name}</button>)}</div>}
      <div className="opponents">{game.opponents.map(opponent => <div data-player={opponent.name} className={`opponent ${game.current_player === opponent.name ? "active-player" : ""}`} key={opponent.name}><div className="player-label"><span className="avatar">{opponent.name[0].toUpperCase()}</span><div><strong>{opponent.name}</strong><small>{opponent.hand_count} in hand</small></div></div><BackCards count={opponent.hand_count} small /></div>)}</div>
      <div className="reserve opponent-reserve"><span>Opponents' next cards</span></div>
      <div className="center-stage"><div className="deck-slot">{game.deck_count ? <Card hidden disabled /> : <div className="empty-card" />}<span><Layers3 size={15} /> {game.deck_count} in deck</span></div><div className="pile-slot"><div ref={pileTargetRef} key={displayedTopCard?.id || "empty"} className="pile-card">{displayedTopCard ? <Card card={displayedTopCard} disabled /> : <div className="empty-card"><Flame size={26} /></div>}</div><span>{game.pile_count ? `${game.pile_count} in pile` : "Empty pile"}</span><button className="pickup pile-action" onClick={() => move("pickup")} disabled={!yourTurn || busy || !game.pile_count}><Hand size={18} /> Pick up</button></div></div>
      {moveAnimation?.card && <div style={moveAnimation.motion || undefined} className={`move-flight ${moveFromYou ? "from-you" : "from-opponent"}`}><Card card={moveAnimation.card} disabled /></div>}
      {moveAnimation && ["pickup", "blind_pickup"].includes(moveAnimation.action) && <div style={moveAnimation.motion || undefined} className={`pickup-flight ${moveFromYou ? "to-you" : "to-opponent"}`}><Layers3 size={26} /><span>+{moveAnimation.count}</span></div>}
      {moveAnimation?.power && <div className={`power-callout power-${moveAnimation.power}`}>
        <span className="comic-player"><b>{moveAnimation.player[0].toUpperCase()}</b>{moveAnimation.player}</span>
        <strong>{powerLabels[moveAnimation.power]}</strong>
        <small>slams down the {moveAnimation.card.rank}{suitMarks[moveAnimation.card.suit]}</small>
      </div>}
      <div className="status" aria-live="polite"><span className={yourTurn ? "turn-dot active" : "turn-dot"} /><div><strong>{game.winner ? (game.winner === "you" ? "You won!" : `${game.winner_name} won`) : yourTurn ? "Your turn" : `${game.current_player}'s turn`}</strong><small>{game.message}</small></div>{error && <small className="error">{error}</small>}</div>
      <div className="you"><div className="reserve your-reserve"><span>Your next cards</span><div className="reserve-cards"><BackCards count={game.you.face_down_count} small /><div className="card-row face-up">{game.you.face_up.map(card => <Card key={card.id} card={card} small disabled={!yourTurn || game.you.active_zone !== "face_up" || busy || !game.legal_ids.includes(card.id)} onClick={event => move("play", card.id, event.currentTarget)} />)}</div></div></div>
        <div data-player={game.you.name} className={`hand-area ${yourTurn ? "active-player" : ""}`}><div className="player-label"><span className="avatar you-avatar">{game.you.name[0].toUpperCase()}</span><div><strong>{game.you.name}</strong><small>{game.you.active_zone.replace("_", " ")}</small></div></div><div className="card-row hand-cards">{faceDownActive ? Array.from({ length: game.you.face_down_count }, (_, i) => <button key={i} className="card card-back" disabled={!yourTurn || busy} onClick={event => move("play", `face-down-${i}`, event.currentTarget)} aria-label="Flip a face-down card" />) : activeCards.map(card => <Card key={card.id} card={card} disabled={!yourTurn || busy || !game.legal_ids.includes(card.id)} onClick={event => move("play", card.id, event.currentTarget)} />)}</div></div>
      </div>
    </section></main>;
}

function App() {
  const [username, setUsername] = useState(undefined);
  const [room, setRoom] = useState(null);
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      try {
        const data = await api("/api/auth/session/");
        setUsername(data.username);
        const savedRoom = window.localStorage.getItem("shithead-room");
        if (data.username && savedRoom) {
          try { setRoom(await api(`/api/rooms/${savedRoom}/`)); }
          catch { window.localStorage.removeItem("shithead-room"); }
        }
      } catch { setUsername(null); }
    }
    restoreSession();
  }, []);
  function enterRoom(nextRoom) { window.localStorage.setItem("shithead-room", nextRoom.code); setRoom(nextRoom); }
  function leaveRoom() { window.localStorage.removeItem("shithead-room"); setRoom(null); }
  async function logout() { await api("/api/auth/session/", { method: "DELETE" }); window.localStorage.removeItem("shithead-room"); setRoom(null); setUsername(null); }
  if (username === undefined) return <main className="loading"><span className="spinner" />Checking your seat...</main>;
  if (!username) return <AuthScreen onAuthenticated={setUsername} />;
  if (!room) return <Lobby username={username} onRoom={enterRoom} onLogout={logout} />;
  return <GameRoom room={room} setRoom={enterRoom} soundOn={soundOn} setSoundOn={setSoundOn} onLeave={leaveRoom} />;
}

export default App;
