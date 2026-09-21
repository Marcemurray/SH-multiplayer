import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Copy, DoorOpen, Flame, Hand, Layers3, LogOut, Plus, UserPlus, Volume2, VolumeX, X } from "lucide-react";

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
  const notes = kind === "win" ? [523, 659, 784] : kind === "turn" ? [392, 523, 659] : kind === "burn" ? [180, 110] : [kind === "pickup" ? 150 : 290];
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
  const powerNames = { "2": "Reset", "7": "Keep it low", "10": "Burn" };
  const powerName = card && powerNames[card.rank];
  const cardClasses = [
    "card",
    hidden ? "card-back" : "card-face",
    card ? `suit-${card.suit}` : "",
    powerName ? `power-card rank-${card.rank}` : "",
    red ? "red" : "",
    small ? "small" : "",
  ].filter(Boolean).join(" ");

  return <button className={cardClasses} disabled={disabled || hidden} onClick={onClick} aria-label={hidden ? "Face-down card" : `${card.rank} of ${card.suit}`}>
    {!hidden && <>
      <span className="corner">{card.rank}<b>{suitMarks[card.suit]}</b></span>
      <span className="card-art" aria-hidden="true"><strong>{card.rank}</strong><b>{suitMarks[card.suit]}</b></span>
      {powerName && <span className="power-label">{powerName}</span>}
      <span className="corner corner-bottom" aria-hidden="true">{card.rank}<b>{suitMarks[card.suit]}</b></span>
    </>}
  </button>;
}

function BackCards({ count, small = false }) {
  const visible = Math.min(count, 3);
  return <div className="card-row stacked">{Array.from({ length: visible }, (_, i) => <Card key={i} hidden small={small} />)}{count > 3 && <span className="count-badge">{count}</span>}</div>;
}

function NextCards({ label, ariaLabel = label, faceUp, faceDownCount, className = "", playable = false, busy = false, legalIds = [], onPlay }) {
  const total = faceUp.length + faceDownCount;
  return <section className={`reserve ${className}`} aria-label={ariaLabel}>
    <div className="reserve-heading"><span>{label}</span></div>
    <div className="reserve-cards">
      <BackCards count={faceDownCount} small />
      <div className="card-row face-up">{faceUp.map(card => <Card key={card.id} card={card} small disabled={!playable || busy || !legalIds.includes(card.id)} onClick={onPlay ? event => onPlay(card.id, event.currentTarget) : undefined} />)}</div>
      {!total && <span className="reserve-empty">Cleared</span>}
    </div>
    <div className="reserve-meta"><span><b>{faceUp.length}</b> up</span><span><b>{faceDownCount}</b> blind</span></div>
  </section>;
}

function LeaveDialog({ open, busy, onCancel, onConfirm }) {
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onCancel()}>
    <section className="leave-dialog" role="dialog" aria-modal="true" aria-labelledby="leave-title">
      <span className="comic-kicker">Leaving so soon?</span>
      <h2 id="leave-title">Leave this table?</h2>
      <p>Your seat and cards will return to the game.</p>
      <div className="dialog-actions"><button className="text-button" onClick={onCancel} disabled={busy}>Stay</button><button className="danger-button" onClick={onConfirm} disabled={busy}><LogOut size={17} /> {busy ? "Leaving..." : "Leave table"}</button></div>
    </section>
  </div>;
}

function RulesPage({ onClose }) {
  useEffect(() => {
    function closeOnEscape(event) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return <main className="rules-page" role="dialog" aria-modal="true" aria-labelledby="rules-title">
    <div className="rules-shell">
      <header className="rules-header"><div className="brand"><span className="brand-mark" role="img" aria-label="Shithead">{"\uD83D\uDCA9"}</span><div><span className="eyebrow">Quick reference</span><h1 id="rules-title">How to play</h1></div></div><button className="rules-close" onClick={onClose}><X size={19} /> Back to table</button></header>
      <section className="rules-hero"><span className="comic-kicker">Dump your cards. Dodge the pile.</span><h2>Be the first player with nothing left.</h2><p>Play through your hand, then your visible table cards, and finally your blind cards.</p></section>
      <section className="rules-grid">
        <article className="rule-panel rule-setup"><span className="rule-number">01</span><h3>The deal</h3><p>Everyone starts with <strong>3 cards in hand</strong>, <strong>3 face up</strong>, and <strong>3 face down</strong>. Your face-up and blind cards are waiting for later.</p></article>
        <article className="rule-panel"><span className="rule-number">02</span><h3>On your turn</h3><p>Play a card equal to or higher than the effective top card. Suits do not affect value. If you cannot—or do not want to—play, pick up the entire pile.</p></article>
        <article className="rule-panel"><span className="rule-number">03</span><h3>Keep three</h3><p>While the deck still has cards, you automatically draw back up to three after playing. Once the deck is empty, your hand begins to shrink.</p></article>
        <article className="rule-panel"><span className="rule-number">04</span><h3>Clear your zones</h3><p>Empty your hand first, then play your face-up cards. Finish by flipping one face-down card blindly each turn.</p></article>
      </section>
      <section className="power-rules"><div className="rules-section-title"><span className="eyebrow">Power cards</span><h2>Break the normal order</h2></div><div className="power-rule-grid">
        <article className="power-rule reset-rule"><span className="rule-rank">2</span><div><h3>Reset</h3><p>Always playable. It clears the old pile value, so the next player may play anything.</p></div></article>
        <article className="power-rule low-rule"><span className="rule-rank">7</span><div><h3>Keep it low</h3><p>The next player must play a 7 or lower—or use another always-playable power card.</p></div></article>
        <article className="power-rule burn-rule"><span className="rule-rank">10</span><div><h3>Burn</h3><p>Always playable. It destroys the pile and you immediately take another turn.</p></div></article>
        <article className="power-rule quad-rule"><span className="rule-rank">4×</span><div><h3>Four of a kind</h3><p>Four consecutive cards of the same rank also burn the pile. The player who completes it goes again.</p></div></article>
      </div></section>
      <section className="rules-finish"><div><span className="eyebrow">The risky bit</span><h2>Playing blind</h2><p>Flip a face-down card without seeing it. If it cannot be played, you take that card plus the whole pile into your hand and your turn ends.</p></div><div><span className="eyebrow">How to win</span><h2>Get rid of everything</h2><p>The first player to clear their hand, face-up cards, and face-down cards wins the game.</p></div></section>
    </div>
  </main>;
}

function AuthScreen({ onAuthenticated, onRules }) {
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
    <span className="comic-kicker">Dump your cards. Dodge the pile.</span>
    <div className="brand auth-brand"><span className="brand-mark brand-mark-large" role="img" aria-label="Shithead">{"\uD83D\uDCA9"}</span><div><h1>Shithead</h1><p>Pick a name and hit the table</p></div></div>
    <form onSubmit={submit}>
      <label>What do we call you?<input value={username} onChange={event => setUsername(event.target.value)} minLength="2" maxLength="20" autoComplete="nickname" autoFocus placeholder="Player name" required /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="primary-button comic-button" disabled={busy}>{busy ? "Shuffling..." : "Let's play"}</button>
      <button type="button" className="rules-link" onClick={onRules}><BookOpen size={17} /> How to play</button>
    </form>
  </section></main>;
}

function Lobby({ username, onRoom, onLogout, onRules }) {
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

  return <main className="entry-screen lobby-screen"><header className="lobby-header"><div className="brand"><span className="brand-mark" role="img" aria-label="Shithead">{"\uD83D\uDCA9"}</span><div><h1>Shithead</h1><p>Playing as {username}</p></div></div><div className="header-actions"><button className="rules-header-button" onClick={onRules}><BookOpen size={17} /> Rules</button><button className="icon-button" onClick={onLogout} title="Change player"><LogOut size={19} /></button></div></header>
    <section className="lobby-panel"><div className="lobby-title"><span className="comic-kicker">Ready when you are</span><h2>Pick a table!</h2></div>
      <button className="room-action comic-action" onClick={createRoom} disabled={busy}><Plus size={22} /><span><strong>Create room</strong><small>Deal a fresh table</small></span></button>
      <div className="divider"><span>or join with a code</span></div>
      <form className="join-form" onSubmit={joinRoom}><input value={code} onChange={event => setCode(event.target.value.toUpperCase())} maxLength="5" placeholder="ABCDE" aria-label="Room code" required /><button className="primary-button" disabled={busy || code.length !== 5}><DoorOpen size={18} /> Join room</button></form>
      <div className="room-list"><div className="room-list-heading"><span>Open tables</span><small>{rooms.length} available</small></div>{rooms.length ? rooms.map(room => <div className="room-row" key={room.code}><div><strong>{room.code}</strong><small>{room.host}'s table · {room.player_count}/4 players{room.in_progress ? " · In progress" : ""}</small></div><button className="icon-button" onClick={() => requestRoom(room.code)} disabled={busy} title="Request to join"><UserPlus size={18} /></button></div>) : <p className="empty-list">No open tables yet.</p>}</div>
      {error && <p className="form-error">{error}</p>}
    </section></main>;
}

function GameRoom({ room, setRoom, soundOn, setSoundOn, onLeave, onRules }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [effect, setEffect] = useState("");
  const [moveAnimation, setMoveAnimation] = useState(null);
  const [showPreviousTop, setShowPreviousTop] = useState(false);
  const [connection, setConnection] = useState("connecting");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const audioContextRef = useRef(null);
  const lastMoveRef = useRef(room.game?.move_seq || 0);
  const animationTimerRef = useRef(null);
  const pileSwapTimerRef = useRef(null);
  const pileTargetRef = useRef(null);
  const displayedGameRef = useRef(room.game);
  const previousYourTurnRef = useRef(false);
  const isYourTurn = room.status === "playing" && Boolean(room.game?.your_turn) && room.game?.winner === null;

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

  useEffect(() => {
    document.title = isYourTurn ? "▶ YOUR TURN · Shithead" : "Shithead";
    if (isYourTurn && !previousYourTurnRef.current) {
      if (soundOn) playSound("turn", audioContextRef);
      if (soundOn && navigator.vibrate) navigator.vibrate([140, 80, 140]);
    }
    previousYourTurnRef.current = isYourTurn;
    return () => { document.title = "Shithead"; };
  }, [isYourTurn, soundOn]);

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

  async function leaveTable() {
    setBusy(true); setError("");
    try {
      await api(`/api/rooms/${room.code}/leave/`, { method: "POST", body: "{}" });
      onLeave();
    } catch (err) { setError(err.message); setConfirmLeave(false); }
    finally { setBusy(false); }
  }

  if (room.status !== "playing") return <><main className="entry-screen"><section className="waiting-panel"><span className="waiting-pulse" /><p className="eyebrow">{room.status === "pending" ? "Request sent" : "Room ready"}</p><h2>{room.code}</h2><p>{room.status === "pending" ? "Waiting for the host to approve your request" : "Share the code or approve players below"}</p><button className="copy-button" onClick={() => navigator.clipboard.writeText(room.code)}><Copy size={18} /> Copy room code</button>{room.pending?.map(player => <button className="approve-button" key={player.id} onClick={async () => setRoom(await api(`/api/rooms/${room.code}/approve/${player.id}/`, { method: "POST", body: "{}" }))}><Check size={17} /> Approve {player.name}</button>)}{error && <p className="form-error">{error}</p>}<button className="rules-link" onClick={onRules}><BookOpen size={17} /> Read the rules</button><button className="text-button" onClick={() => setConfirmLeave(true)}>Back to lobby</button></section></main><LeaveDialog open={confirmLeave} busy={busy} onCancel={() => setConfirmLeave(false)} onConfirm={leaveTable} /></>;

  const game = room.game;
  displayedGameRef.current = game;
  const yourTurn = game.your_turn && game.winner === null;
  const activeCards = game.you[game.you.active_zone] || [];
  const faceDownActive = game.you.active_zone === "face_down";
  const powerLabels = { reset: "FRESH START!", low: "KEEP IT LOW!", burn: "KABOOM!", quad: "QUAD BURN!" };
  const moveFromYou = moveAnimation?.player === game.you.name;
  const displayedTopCard = showPreviousTop ? moveAnimation?.previousTop : game.top_card;

  return <main className="game-shell"><header><div className="brand"><span className="brand-mark" role="img" aria-label="Shithead">{"\uD83D\uDCA9"}</span><div><h1>Room {room.code}</h1><p>{room.players.join(" vs ")}</p></div></div><div className="header-actions"><span className={`connection-state ${connection}`}><i />{connection === "live" ? "Live" : "Reconnecting"}</span><button className="icon-button" onClick={onRules} title="View rules"><BookOpen size={19} /></button><button className="icon-button" onClick={() => setSoundOn(value => !value)} title={soundOn ? "Mute sounds" : "Turn sounds on"}>{soundOn ? <Volume2 size={19} /> : <VolumeX size={19} />}</button><button className="icon-button" onClick={() => setConfirmLeave(true)} title="Leave table"><LogOut size={19} /></button></div></header>
    <section className={`table ${isYourTurn ? "your-turn" : ""} ${moveAnimation?.power ? `table-power-${moveAnimation.power}` : ""}`} aria-label="Card table">
      {!!room.pending?.length && <div className="join-requests"><span><UserPlus size={16} /> Join request</span>{room.pending.map(player => <button key={player.id} onClick={() => approvePlayer(player.id)} disabled={busy}><Check size={15} /> Add {player.name}</button>)}</div>}
      <div className="mobile-zone-label rivals-zone">Rivals</div>
      <div className="opponents">{game.opponents.map(opponent => <div data-player={opponent.name} className={`opponent ${game.current_player === opponent.name ? "active-player" : ""}`} key={opponent.name}><div className="opponent-hand"><div className="player-label"><span className="avatar">{opponent.name[0].toUpperCase()}</span><div><strong>{opponent.name}</strong><small>{opponent.hand_count} cards</small></div></div><BackCards count={opponent.hand_count} small /></div><NextCards label="Next cards" ariaLabel={`${opponent.name}'s next cards`} faceUp={opponent.face_up} faceDownCount={opponent.face_down_count} className="opponent-next" /></div>)}</div>
      <div className="mobile-zone-label pile-zone">Table</div>
      <div className="center-stage"><div className="deck-slot">{game.deck_count ? <Card hidden disabled /> : <div className="empty-card" />}<span><Layers3 size={15} /> Deck · {game.deck_count}</span></div><div className="pile-slot"><div ref={pileTargetRef} key={displayedTopCard?.id || "empty"} className="pile-card">{displayedTopCard ? <Card card={displayedTopCard} disabled /> : <div className="empty-card"><Flame size={26} /></div>}</div><span>Pile · {game.pile_count || "empty"}</span><button className="pickup pile-action" onClick={() => move("pickup")} disabled={!yourTurn || busy || !game.pile_count}><Hand size={18} /> Pick up</button></div></div>
      {moveAnimation?.card && <div style={moveAnimation.motion || undefined} className={`move-flight ${moveFromYou ? "from-you" : "from-opponent"}`}><Card card={moveAnimation.card} disabled /></div>}
      {moveAnimation && ["pickup", "blind_pickup"].includes(moveAnimation.action) && <div style={moveAnimation.motion || undefined} className={`pickup-flight ${moveFromYou ? "to-you" : "to-opponent"}`}><Layers3 size={26} /><span>+{moveAnimation.count}</span></div>}
      {moveAnimation?.power && <div className={`power-callout power-${moveAnimation.power}`}>
        <span className="comic-player"><b>{moveAnimation.player[0].toUpperCase()}</b>{moveAnimation.player}</span>
        <strong>{powerLabels[moveAnimation.power]}</strong>
        <small>slams down the {moveAnimation.card.rank}{suitMarks[moveAnimation.card.suit]}</small>
      </div>}
      <div className={`status ${yourTurn ? "your-turn-status" : ""}`} aria-live="polite"><span className={yourTurn ? "turn-dot active" : "turn-dot"} /><div><strong>{game.winner ? (game.winner === "you" ? "You won!" : `${game.winner_name} won`) : yourTurn ? "Your turn" : `${game.current_player}'s turn`}</strong><small>{game.message}</small></div>{error && <small className="error">{error}</small>}</div>
      <div className="mobile-zone-label your-zone">Your corner</div>
      <div className="you"><NextCards label="Next cards" ariaLabel="Your next cards" faceUp={game.you.face_up} faceDownCount={game.you.face_down_count} className="your-reserve" playable={yourTurn && game.you.active_zone === "face_up"} busy={busy} legalIds={game.legal_ids} onPlay={(cardId, element) => move("play", cardId, element)} />
        <div data-player={game.you.name} className={`hand-area ${yourTurn ? "active-player" : ""}`}><div className="player-label"><span className="avatar you-avatar">{game.you.name[0].toUpperCase()}</span><div><strong>{game.you.name}</strong><small>{game.you.active_zone.replace("_", " ")}</small></div></div><div className="card-row hand-cards">{faceDownActive ? Array.from({ length: game.you.face_down_count }, (_, i) => <button key={i} className="card card-back" disabled={!yourTurn || busy} onClick={event => move("play", `face-down-${i}`, event.currentTarget)} aria-label="Flip a face-down card" />) : activeCards.map(card => <Card key={card.id} card={card} disabled={!yourTurn || busy || !game.legal_ids.includes(card.id)} onClick={event => move("play", card.id, event.currentTarget)} />)}</div></div>
      </div>
    </section><LeaveDialog open={confirmLeave} busy={busy} onCancel={() => setConfirmLeave(false)} onConfirm={leaveTable} /></main>;
}

function App() {
  const [username, setUsername] = useState(undefined);
  const [room, setRoom] = useState(null);
  const [soundOn, setSoundOn] = useState(true);
  const [showRules, setShowRules] = useState(false);

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
  const view = !username
    ? <AuthScreen onAuthenticated={setUsername} onRules={() => setShowRules(true)} />
    : !room
      ? <Lobby username={username} onRoom={enterRoom} onLogout={logout} onRules={() => setShowRules(true)} />
      : <GameRoom room={room} setRoom={enterRoom} soundOn={soundOn} setSoundOn={setSoundOn} onLeave={leaveRoom} onRules={() => setShowRules(true)} />;
  return <>{view}{showRules && <RulesPage onClose={() => setShowRules(false)} />}</>;
}

export default App;
