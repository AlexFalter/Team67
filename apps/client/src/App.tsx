import { useEffect, useRef, useState } from "react";
import { Engine } from "./engine/Engine";
import { InspectMode } from "./engine/InspectMode";

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState({ fraction: 0, label: "Loading" });
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const engine = new Engine(canvasRef.current!), abort = new AbortController();
    engine.load(abort.signal, (fraction, label) => setProgress({ fraction, label }))
      .then(() => { engine.setMode(new InspectMode(engine)); setLoaded(true); })
      .catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : String(e)); });
    return () => { abort.abort(); engine.dispose(); };
  }, []);

  return (
    <main>
      <canvas ref={canvasRef} />
      {!loaded && (
        <div className="loading">
          <p>{error || progress.label}</p>
          <div className="bar"><div style={{ width: `${progress.fraction * 100}%` }} /></div>
        </div>
      )}
    </main>
  );
}
