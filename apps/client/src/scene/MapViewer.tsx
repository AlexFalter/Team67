import { useEffect, useRef, useState } from "react";
import {
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  PCFShadowMap,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { disposeMap, loadZurichMap } from "../maps/zurich/loadZurichMap";
import { GameOverlay } from "../multiplayer/GameOverlay";
import { MapGame } from "../multiplayer/MapGame";
import { ExamOverlay } from "../exam/ExamOverlay";
import { ExamDebugButton } from "../exam/ExamDebugButton";
import { emptyExamSession, type ExamSession } from "../exam/ExamSequence";
import { activeTheme } from "../maps/zurich/theme";

export function MapViewer() {
  const [examSession, setExamSession] = useState<ExamSession>(emptyExamSession);
  const [playing, setPlaying] = useState(true);
  const [resolution, setResolution] = useState<"performance" | "high">("performance");
  return (
    <div className="map-viewer" data-exam-active={examSession.stage !== "world"}>
      <MapCanvas key={playing ? "play" : "inspect"} playing={playing}
        resolution={resolution} onResolutionChange={setResolution} examSession={examSession} onExamChange={setExamSession} />
      <button
        className="mode-toggle"
        onClick={() => { setExamSession(emptyExamSession); setPlaying((value) => !value); }}
      >
        {playing ? "Inspect map" : "Join multiplayer"}
      </button>
    </div>
  );
}

function MapCanvas({ playing, resolution, onResolutionChange, examSession, onExamChange }: {
  examSession: ExamSession;
  onExamChange: (session: ExamSession) => void;
  playing: boolean;
  resolution: "performance" | "high";
  onResolutionChange: (resolution: "performance" | "high") => void;
}) {
  const gameRef = useRef<MapGame | undefined>(undefined);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const resolutionRef = useRef(resolution);
  const fitRef = useRef<(() => void) | undefined>(undefined);
  const [status, setStatus] = useState("Loading official Zürich 3D map…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    resolutionRef.current = resolution;
    fitRef.current?.();
  }, [resolution]);

  useEffect(() => {
    const canvas = canvasRef.current,
      hud = hudRef.current,
      hints = controlsRef.current;
    if (!canvas || !hud || !hints) return;
    const abort = new AbortController();
    let renderer: WebGLRenderer | undefined,
      controls: OrbitControls | undefined;
    let resize: ResizeObserver | undefined,
      game: MapGame | undefined,
      sunlight: DirectionalLight | undefined;
    const scene = new Scene();
    const theme = activeTheme();
    scene.background = new Color(theme.sky);
    canvas.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        renderer?.setAnimationLoop(null);
        game?.dispose();
        game = undefined; gameRef.current = undefined;
        setFailed(true);
        setStatus("WebGL context lost. Reload to restart the game.");
      },
      { signal: abort.signal },
    );

    async function initialize() {
      try {
        const map = await loadZurichMap(abort.signal);
        if (abort.signal.aborted) {
          disposeMap(map);
          return;
        }
        scene.add(map);
        map.traverse((object) => {
          if (object instanceof Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });
        renderer = new WebGLRenderer({ canvas: canvas!, antialias: true,
          powerPreference: "high-performance" });
        renderer.shadowMap.enabled = playing;
        renderer.shadowMap.type = PCFShadowMap;
        const light = theme.lighting;
        scene.add(new HemisphereLight(light.skyLight, light.groundLight, light.hemiIntensity));
        const sun = new DirectionalLight(light.sun, light.sunIntensity);
        sunlight = sun;
        // sun direction from the theme (azimuth from north, clockwise; map north = -Z)
        const el = (light.sunElevation * Math.PI) / 180, az = (light.sunAzimuth * Math.PI) / 180;
        const sunDir = { x: Math.sin(az) * Math.cos(el), y: Math.sin(el), z: -Math.cos(az) * Math.cos(el) };
        sun.position.set(sunDir.x * 900, sunDir.y * 900, sunDir.z * 900);
        sun.castShadow = playing;
        sun.shadow.mapSize.set(1024, 1024);
        Object.assign(sun.shadow.camera, {
          left: -30,
          right: 30,
          top: 30,
          bottom: -30,
          near: 1,
          far: 120,
        });
        sun.shadow.bias = -0.0005;
        scene.add(sun, sun.target);
        const camera = new PerspectiveCamera(
          playing ? 60 : 45,
          1,
          playing ? 0.1 : 1,
          6000,
        );
        if (playing) { game = new MapGame(scene, camera, canvas!, hud!, hints!, map, () => renderer!.render(scene, camera), onExamChange); gameRef.current = game; }
        else {
          camera.position.set(650, 850, 900);
          controls = new OrbitControls(camera, canvas!);
          controls.target.set(0, 25, 0);
          controls.enableDamping = true;
          controls.minDistance = 30;
          controls.maxDistance = 2500;
          controls.maxPolarAngle = Math.PI / 2 - 0.02;
          controls.update();
        }
        const fit = () => {
          const { width, height } = canvas!.getBoundingClientRect();
          // Keep the default drawing buffer near 1080p even on large/HiDPI displays.
          const density = resolutionRef.current === "high"
            ? Math.min(window.devicePixelRatio, 2)
            : Math.min(window.devicePixelRatio, 1,
              Math.sqrt(1920 * 1080 / (Math.max(width, 1) * Math.max(height, 1))));
          renderer!.setDrawingBufferSize(Math.max(width, 1), Math.max(height, 1), density);
          camera.aspect = Math.max(width, 1) / Math.max(height, 1);
          camera.updateProjectionMatrix();
        };
        resize = new ResizeObserver(fit);
        fitRef.current = fit;
        resize.observe(canvas!);
        window.addEventListener("resize", fit, { signal: abort.signal });
        fit();
        let previous = performance.now();
        renderer.setAnimationLoop(() => {
          const now = performance.now();
          controls?.update();
          game?.update((now - previous) / 1000, now);
          previous = now;
          if (game) {
            const p = game.focus;
            sun.position.set(p.x + sunDir.x * 50, p.y + sunDir.y * 50, p.z + sunDir.z * 50);
            sun.target.position.set(p.x, p.y, p.z);
            sun.target.updateMatrixWorld();
          }
          if (!game?.examScreenVisible) {
            renderer!.render(scene, camera);
            game?.afterRender();
          }
        });
        setStatus("Map loaded");
      } catch (error) {
        if (abort.signal.aborted) return;
        setFailed(true);
        setStatus(
          error instanceof Error ? error.message : "Unable to load the map.",
        );
      }
    }
    void initialize();
    return () => {
      abort.abort();
      fitRef.current = undefined;
      renderer?.setAnimationLoop(null);
      resize?.disconnect();
      controls?.dispose();
      game?.dispose();
      gameRef.current = undefined;
      disposeMap(scene);
      sunlight?.shadow.dispose();
      scene.clear();
      renderer?.dispose();
      renderer?.forceContextLoss();
    };
  }, [playing, onExamChange]);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-label="Multiplayer on the Zürich map between Hauptbahnhof and ETH Zentrum"
      />
      <div
        className={`map-status ${failed ? "error" : ""}`}
        role={failed ? "alert" : "status"}
      >
        {status}
      </div>
      {playing && <ExamOverlay session={examSession} onSkip={() => gameRef.current?.skipExamTransition()}
        onComplete={score => gameRef.current?.completeExam(score)} onExit={() => gameRef.current?.returnFromExam()} />}
      {playing && <ExamDebugButton enabled={examSession.canEnter && examSession.stage === "world"}
        onTeleport={enterPortal => gameRef.current?.debugTeleportToTerrace(enterPortal)} />}
      {playing && <GameOverlay resolution={resolution} onResolutionChange={onResolutionChange} />}
      <div ref={hudRef} className="game-hud" hidden={!playing} />
      <div ref={controlsRef} className="map-controls">
        {playing
          ? "Mouse / trackpad look · WASD run · Space jump · Esc menu"
          : "Drag to orbit · Right-drag to pan · Scroll to zoom"}
      </div>
    </>
  );
}
