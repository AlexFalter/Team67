import { useEffect, useRef, useState, type FormEvent } from "react";
import { CHARACTERS, END_ROUND, READY, TO_LOBBY, playerName, roomCode } from "@race/shared";
import { Engine } from "./engine/Engine";
import { InspectMode } from "./engine/InspectMode";
import { PlayMode, type RoomInfo, type Settings } from "./game/PlayMode";
import { Net } from "./net/Net";

type Screen = "menu" | "inspect" | "practice" | "room";

function stored<T>(key: string, fallback: T): T {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? "{}") }; } catch { return fallback; }
}
function store(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

/** React owns menus and room screens only; the game runs in Engine's loop and writes its own HUD. */
export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | undefined>(undefined);
  const playRef = useRef<PlayMode | undefined>(undefined);
  const [progress, setProgress] = useState({ fraction: 0, label: "Loading" });
  const [loadError, setLoadError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState<Screen>("menu");
  const [net, setNet] = useState<Net>();
  const [room, setRoom] = useState<RoomInfo>();
  const [disconnected, setDisconnected] = useState(false);
  const [locked, setLocked] = useState(false);
  const [settings, setSettings] = useState(() => stored<Settings>("settings", { sensitivity: 0.0022, bob: true }));
  const [profile, setProfile] = useState(() => stored("profile", { name: "", character: 0, code: "" }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const engine = new Engine(canvasRef.current!), abort = new AbortController();
    engineRef.current = engine;
    engine.load(abort.signal, (fraction, label) => setProgress({ fraction, label }))
      .then(() => setLoaded(true))
      .catch(e => { if (!abort.signal.aborted) setLoadError(e instanceof Error ? e.message : String(e)); });
    return () => { abort.abort(); engine.dispose(); engineRef.current = undefined; };
  }, []);

  // One mode at a time in the engine loop. Entering a room uses the connection made on submit.
  useEffect(() => {
    const engine = engineRef.current;
    if (!loaded || !engine) return;
    if (screen === "practice" || (screen === "room" && net)) {
      const play = new PlayMode(engine, hudRef.current!, settings, setLocked, net, setRoom);
      playRef.current = play;
      engine.setMode(play);
    } else engine.setMode(new InspectMode(engine));
    return () => { engine.setMode(undefined); playRef.current = undefined; setLocked(false); };
    // settings are applied live below; only the screen/connection recreates the mode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, screen, net]);

  useEffect(() => {
    if (!net) return;
    const off = net.onClosed(() => setDisconnected(true));
    return () => { off(); net.dispose(); };
  }, [net]);

  useEffect(() => {
    playRef.current?.apply(settings);
    store("settings", settings);
  }, [settings]);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const mode = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "join" ? "join" : "create";
    setError("");
    try {
      const name = playerName(profile.name);
      const code = roomCode(profile.code || (mode === "create" ? Math.random().toString(36).slice(2, 8) : ""));
      setBusy(true);
      const connection = await Net.connect({ mode, code, name, character: profile.character });
      store("profile", { ...profile, code });
      setProfile({ ...profile, code });
      setRoom(undefined);
      setDisconnected(false);
      setNet(connection);
      setScreen("room");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function leave() {
    setNet(undefined);
    setRoom(undefined);
    setScreen("menu");
  }

  const isHost = !!room && room.host === room.me;
  const meInRoom = room?.players.find(p => p.id === room.me);
  const pause = (screen === "practice" || (screen === "room" && room?.active)) && !locked;

  return (
    <main>
      <canvas ref={canvasRef} />
      <div ref={hudRef} className="hud" hidden={screen !== "practice" && screen !== "room"} />
      {!loaded && (
        <div className="loading">
          <p>{loadError || progress.label}</p>
          <div className="bar"><div style={{ width: `${progress.fraction * 100}%` }} /></div>
        </div>
      )}

      {loaded && screen === "menu" && (
        <form className="panel" onSubmit={connect}>
          <h1>Zürich Chase</h1>
          <label>Name
            <input type="text" maxLength={24} autoComplete="nickname" value={profile.name} required
              onChange={e => setProfile({ ...profile, name: e.target.value })} />
          </label>
          <label>Character
            <select value={profile.character} onChange={e => setProfile({ ...profile, character: Number(e.target.value) })}>
              {CHARACTERS.map((c, i) => <option key={c} value={i}>{c}</option>)}
            </select>
          </label>
          <label>Room code
            <input type="text" maxLength={12} autoComplete="off" placeholder="e.g. TEAM67 (blank = random)" value={profile.code}
              onChange={e => setProfile({ ...profile, code: e.target.value.toUpperCase() })} />
          </label>
          <div className="row">
            <button type="submit" value="create" disabled={busy}>Create room</button>
            <button type="submit" value="join" disabled={busy}>Join room</button>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button type="button" className="secondary" onClick={() => setScreen("practice")}>Practice offline</button>
            <button type="button" className="secondary" onClick={() => setScreen("inspect")}>Inspect map</button>
          </div>
        </form>
      )}

      {screen === "inspect" && <button className="corner" onClick={() => setScreen("menu")}>Back to menu</button>}

      {screen === "room" && disconnected && (
        <div className="panel">
          <h2>Disconnected</h2>
          <p>The connection to the room was lost.</p>
          <button onClick={leave}>Back to menu</button>
        </div>
      )}

      {screen === "room" && !disconnected && room && !room.active && (
        <div className="panel">
          <p className="eyebrow">Room {room.code}</p>
          <h2>{room.phase === "Lobby" ? "Lobby" : room.phase === "Running" ? "Round in progress" : "Round finished"}</h2>
          {room.phase === "Running" && <p>You joined during a round. You will play in the next one.</p>}
          {room.phase === "Finished" ? (
            <table>
              <thead><tr><th>Player</th><th>Hits</th><th>Taken</th></tr></thead>
              <tbody>{room.results.map((r, i) => <tr key={i}><td>{r.name}</td><td>{r.hits}</td><td>{r.taken}</td></tr>)}</tbody>
            </table>
          ) : (
            <ul className="roster">
              {room.players.map(p => (
                <li key={p.id}>
                  {p.name}{p.id === room.me ? " (you)" : ""}{p.id === room.host ? " · host" : ""}
                  <span>{room.phase === "Lobby" ? (p.ready ? "Ready" : "Not ready") : p.waiting ? "Waiting" : "Playing"}</span>
                </li>
              ))}
            </ul>
          )}
          {room.phase === "Lobby" && <p className="keys">The round starts when everyone is ready.</p>}
          {room.phase === "Lobby" && (
            <button onClick={() => net?.send(READY, !meInRoom?.ready)}>{meInRoom?.ready ? "Cancel ready" : "Ready"}</button>
          )}
          {room.phase === "Finished" && (isHost
            ? <button onClick={() => net?.send(TO_LOBBY)}>Return everyone to the lobby</button>
            : <p className="keys">Waiting for the host to return everyone to the lobby.</p>)}
          <button className="secondary" onClick={leave}>Leave room</button>
        </div>
      )}

      {pause && !disconnected && (
        <div className="panel">
          <h2>{screen === "practice" ? "Practice" : `Room ${room?.code}`}</h2>
          <button autoFocus onClick={() => void playRef.current?.input.lock()}>Click to play</button>
          <label>Mouse sensitivity
            <input type="range" min={0.0005} max={0.006} step={0.0001} value={settings.sensitivity}
              onChange={e => setSettings({ ...settings, sensitivity: Number(e.target.value) })} />
          </label>
          <label className="row"><input type="checkbox" checked={settings.bob}
            onChange={e => setSettings({ ...settings, bob: e.target.checked })} /> Camera bob</label>
          <p className="keys">WASD move · Shift sprint · Space jump · F / click punch · E vehicle · R running shoes · V / F5 view · F3 debug · Esc menu</p>
          {isHost && <button className="secondary" onClick={() => net?.send(END_ROUND)}>End round for everyone</button>}
          <button className="secondary" onClick={screen === "practice" ? () => setScreen("menu") : leave}>Leave</button>
        </div>
      )}
    </main>
  );
}
