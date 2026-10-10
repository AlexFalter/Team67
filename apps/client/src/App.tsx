import { useEffect, useRef, useState } from "react";
import { Engine } from "./engine/Engine";
import { InspectMode } from "./engine/InspectMode";
import { PlayMode, type Settings } from "./game/PlayMode";

type Screen = "menu" | "inspect" | "play";

function loadSettings(): Settings {
  try { return { sensitivity: 0.0022, bob: true, ...JSON.parse(localStorage.getItem("settings") ?? "{}") }; }
  catch { return { sensitivity: 0.0022, bob: true }; }
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | undefined>(undefined);
  const playRef = useRef<PlayMode | undefined>(undefined);
  const [progress, setProgress] = useState({ fraction: 0, label: "Loading" });
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState<Screen>("menu");
  const [locked, setLocked] = useState(false);
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => {
    const engine = new Engine(canvasRef.current!), abort = new AbortController();
    engineRef.current = engine;
    engine.load(abort.signal, (fraction, label) => setProgress({ fraction, label }))
      .then(() => setLoaded(true))
      .catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : String(e)); });
    return () => { abort.abort(); engine.dispose(); engineRef.current = undefined; };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!loaded || !engine) return;
    if (screen === "play") {
      const play = new PlayMode(engine, hudRef.current!, settings, setLocked);
      playRef.current = play;
      engine.setMode(play);
    } else engine.setMode(new InspectMode(engine));
    return () => { engine.setMode(undefined); playRef.current = undefined; setLocked(false); };
    // settings are applied live below; only the screen recreates the mode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, screen]);

  useEffect(() => {
    playRef.current?.apply(settings);
    try { localStorage.setItem("settings", JSON.stringify(settings)); } catch { /* private mode */ }
  }, [settings]);

  return (
    <main>
      <canvas ref={canvasRef} />
      <div ref={hudRef} className="hud" hidden={screen !== "play"} />
      {!loaded && (
        <div className="loading">
          <p>{error || progress.label}</p>
          <div className="bar"><div style={{ width: `${progress.fraction * 100}%` }} /></div>
        </div>
      )}
      {loaded && screen === "menu" && (
        <div className="panel">
          <h1>Zürich Chase</h1>
          <button onClick={() => setScreen("play")}>Practice offline</button>
          <button onClick={() => setScreen("inspect")}>Inspect map</button>
        </div>
      )}
      {screen === "inspect" && <button className="corner" onClick={() => setScreen("menu")}>Back to menu</button>}
      {screen === "play" && !locked && (
        <div className="panel">
          <h2>Paused</h2>
          <button autoFocus onClick={() => void playRef.current?.input.lock()}>Click to play</button>
          <label>Mouse sensitivity
            <input type="range" min={0.0005} max={0.006} step={0.0001} value={settings.sensitivity}
              onChange={e => setSettings({ ...settings, sensitivity: Number(e.target.value) })} />
          </label>
          <label className="row"><input type="checkbox" checked={settings.bob}
            onChange={e => setSettings({ ...settings, bob: e.target.checked })} /> Camera bob</label>
          <p className="keys">WASD move · Shift sprint · Space jump · F / click punch · E vehicle · R shoes · V / F5 view · F3 debug · Esc menu</p>
          <button onClick={() => setScreen("menu")}>Leave</button>
        </div>
      )}
    </main>
  );
}
