import {guardAnimationFrame} from "./guardAnimationFrame";
import { useEffect, useRef, useState } from "react";
import {
  Color,
  DirectionalLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  PCFShadowMap,
  Vector3,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { disposeMap, loadZurichMap } from "../maps/zurich/loadZurichMap";
import { UiPlayground } from "../multiplayer/UiPlayground";
import { GameOverlay } from "../multiplayer/GameOverlay";
import { TrafficEditor } from "../multiplayer/trafficEditor";
import { MapGame } from "../multiplayer/MapGame";
import { ExamOverlay } from "../exam/ExamOverlay";
import { ExamDebugButton } from "../exam/ExamDebugButton";
import { emptyExamSession, ExamSequence, type ExamSession } from "../exam/ExamSequence";
import { createBody, examPortalPosition, examFlyoverPosition, examSecondsRemaining, FINAL_EXAM_LOCATION, examMapPoint, ROUND_DURATION_MS } from "@race/shared";
import { readDuration } from "../minigames/eth-blur/game";
import { activeTheme, applyRendererLook, sharpenMapTextures, themeLights } from "../maps/zurich/theme";
import { createSky } from "../maps/zurich/sky";
import { createColorGrade, mountGradePanel, type ColorGradeHandle } from "./colorGrade";

export function MapViewer({ examPreview = false, offline = false }: { examPreview?: boolean; offline?: boolean }) {
  const [examSession, setExamSession] = useState<ExamSession>(emptyExamSession);
  const [playing, setPlaying] = useState(offline || examPreview || !(import.meta.env.DEV && new URLSearchParams(location.search).has("trafficEditor")));
  const [resolution, setResolution] = useState<"performance" | "high">("high");
  return (
    <div className="map-viewer" data-playing={playing} data-exam-active={examSession.stage !== "world" && examSession.stage !== "spectate"}>
      <MapCanvas key={playing ? "play" : "inspect"} playing={playing}
        resolution={resolution} onResolutionChange={setResolution} examSession={examSession} onExamChange={setExamSession} examPreview={examPreview} offline={offline} />
      {!examPreview && !offline && <button
        className="mode-toggle"
        onClick={() => { setExamSession(emptyExamSession); setPlaying((value) => !value); }}
      >
        {playing ? "Inspect map" : "Join multiplayer"}
      </button>}
    </div>
  );
}

function MapCanvas({ playing, resolution, onResolutionChange, examSession, onExamChange, examPreview, offline }: {
  offline: boolean;
  examPreview: boolean;
  examSession: ExamSession;
  onExamChange: (session: ExamSession) => void;
  playing: boolean;
  resolution: "performance" | "high";
  onResolutionChange: (resolution: "performance" | "high") => void;
}) {
  const gameRef = useRef<MapGame | undefined>(undefined);
  const previewRef = useRef<ExamSequence | undefined>(undefined);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const resolutionRef = useRef(resolution);
  const fitRef = useRef<(() => void) | undefined>(undefined);
  const [status, setStatus] = useState("Loading the Zürich game map…");
  const [failed, setFailed] = useState(false);
  const [initialized, setInitialized] = useState(false);

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
      preview: ExamSequence | undefined,
      sunlight: DirectionalLight | undefined,
      disposeLook: (() => void) | undefined,
      grade: ColorGradeHandle | undefined,
      disposeGradePanel: (() => void) | undefined;
    let trafficEditor: TrafficEditor | undefined;
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
        preview?.dispose(); preview = undefined; previewRef.current = undefined;
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
        renderer = new WebGLRenderer({ canvas: canvas!, antialias: false,
          powerPreference: "high-performance" });
        disposeLook = applyRendererLook(renderer, scene, theme);
        sharpenMapTextures(map, renderer);
        renderer.shadowMap.enabled = playing;
        renderer.shadowMap.type = PCFShadowMap;
        const light = theme.lighting;
        // same lights as the Blender preview (blender/scene_light.py): sun lamp + uniform world colour
        const { sun } = themeLights(theme);  // world light: applyRendererLook
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
        if (theme.skyDome) {
          const sky = createSky(theme.skyDome, new Vector3(sunDir.x, sunDir.y, sunDir.z));
          scene.add(sky.mesh);
          abort.signal.addEventListener("abort", sky.dispose);
        }
        const camera = new PerspectiveCamera(
          playing ? 60 : 45,
          1,
          playing ? 0.1 : 1,
          6000,
        );
        // colour grade after tone mapping (theme "grade", dev panel: G or ?grade)
        grade = createColorGrade(renderer, scene, camera, { exposure: theme.lighting.exposure ?? 1, ...theme.grade });
        if (!examPreview) disposeGradePanel = mountGradePanel(grade, abort.signal);
        if (examPreview) {
          const start = examFlyoverPosition(0);
          camera.position.set(start.x, start.y, start.z);
          const focus = examMapPoint(FINAL_EXAM_LOCATION.ethFocusLV95);
          camera.lookAt(focus.x, focus.y, focus.z);
          preview = new ExamSequence(scene, camera, onExamChange);
          previewRef.current = preview;
        }
        else if (playing) { game = new MapGame(scene, camera, canvas!, hud!, hints!, map, () => grade!.render(), onExamChange, offline); gameRef.current = game; }
        else {
          camera.position.set(650, 850, 900);
          controls = new OrbitControls(camera, canvas!);
          controls.target.set(0, 25, 0);
          controls.enableDamping = true;
          controls.minDistance = 30;
          controls.maxDistance = 2500;
          controls.maxPolarAngle = Math.PI / 2 - 0.02;
          controls.update();
          if (import.meta.env.DEV) {
            trafficEditor = new TrafficEditor(scene, camera, canvas!, map, true);
            controls.enabled = !trafficEditor.active;
          }
        }
        const fit = () => {
          const { width, height } = canvas!.getBoundingClientRect();
          // Keep the default drawing buffer near 1080p even on large/HiDPI displays.
          const density = resolutionRef.current === "high"
            ? Math.min(window.devicePixelRatio, 2)
            : Math.min(window.devicePixelRatio, 1,
              Math.sqrt(1920 * 1080 / (Math.max(width, 1) * Math.max(height, 1))));
          renderer!.setDrawingBufferSize(Math.max(width, 1), Math.max(height, 1), density);
          grade?.setSize(Math.max(width, 1), Math.max(height, 1), density);
          camera.aspect = Math.max(width, 1) / Math.max(height, 1);
          camera.updateProjectionMatrix();
        };
        resize = new ResizeObserver(fit);
        fitRef.current = fit;
        resize.observe(canvas!);
        window.addEventListener("resize", fit, { signal: abort.signal });
        fit();
        let previous = performance.now();
        let previewStarted: number | undefined;
        const previewBody = { ...createBody(), ...examPortalPosition };
        const previewDuration = new URLSearchParams(location.search).has("time") ? readDuration(location.search) : ROUND_DURATION_MS / 1000;
        renderer.setAnimationLoop(guardAnimationFrame(() => {
          const now = performance.now();
          if (controls) { controls.enabled = !trafficEditor?.active; if (controls.enabled) controls.update(); }
          trafficEditor?.update();
          game?.update((now - previous) / 1000, now);
          if (preview && previewStarted !== undefined) {
            preview.update(previewBody, true, true, 1, examSecondsRemaining(previewStarted + previewDuration * 1000, now), now);
          }
          previous = now;
          if (game || preview) {
            const p = game?.focus ?? examPortalPosition;
            sun.position.set(p.x + sunDir.x * 50, p.y + sunDir.y * 50, p.z + sunDir.z * 50);
            sun.target.position.set(p.x, p.y, p.z);
            sun.target.updateMatrixWorld();
          }
          if (!game?.examScreenVisible && !preview?.screenVisible) {
            grade!.render();
            game?.renderMenuPreview(renderer!);
            game?.afterRender();
          }
        }, error => {
          renderer?.setAnimationLoop(null);
          game?.stopAfterFailure();
          if (document.pointerLockElement === canvas) document.exitPointerLock();
          console.error("Game frame failed", error);
          setFailed(true);
          setStatus(`The game stopped: ${error instanceof Error ? error.message : String(error)}. Reload to reconnect.`);
        }));
        setStatus("Preparing characters and vehicles…");
        await game?.ready;
        if (abort.signal.aborted) return;
        setStatus("Preparing the city view…");
        await renderer.compileAsync(scene, camera);
        if (abort.signal.aborted) return;
        setStatus("Map loaded");
        setInitialized(true);
        if (preview) previewStarted = performance.now();
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
      trafficEditor?.dispose();
      controls?.dispose();
      game?.dispose();
      preview?.dispose();
      previewRef.current = undefined;
      gameRef.current = undefined;
      disposeMap(scene);
      sunlight?.shadow.dispose();
      scene.clear();
      disposeLook?.();
      disposeGradePanel?.();
      grade?.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
    };
  }, [playing, onExamChange, examPreview, offline]);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-label="Multiplayer on the Zürich map between Hauptbahnhof and ETH Zentrum"
      />
      {(!initialized || failed) && <section className={`game-loading${failed ? " error" : ""}`} role="status" aria-live="polite">
        <div>
          <p className="loading-route">Zürich HB <span>→</span> ETH HG</p>
          {!failed && <div className="loading-spinner" aria-hidden="true" />}
          <p className="loading-title">{failed ? "Unable to run the game" : "Loading Zürich"}</p>
          <p className="loading-detail">{status}</p>
          {failed && <button onClick={() => location.reload()}>Try again</button>}
        </div>
      </section>}
      {!examPreview && <div
        className={`map-status ${failed ? "error" : ""}`}
        role={failed ? "alert" : "status"}
      >
        {status}
      </div>}
      {playing && <ExamOverlay session={examSession}
        onSpectate={examPreview ? undefined : () => gameRef.current?.spectate()}
        onProgress={progress => { if (!examPreview) gameRef.current?.reportExamProgress(progress); }}
        onComplete={score => examPreview ? previewRef.current?.complete(score) : gameRef.current?.completeExam(score)}
        onExit={() => examPreview ? location.assign("/") : gameRef.current?.returnFromExam()} />}
      {playing && !examPreview && <ExamDebugButton enabled={examSession.canEnter && examSession.stage === "world"}
        onTeleport={enterPortal => gameRef.current?.debugTeleportToTerrace(enterPortal)} />}
      {playing && !examPreview && <GameOverlay offline={offline} resolution={resolution} onResolutionChange={onResolutionChange} />}
      {import.meta.env.DEV && offline && <UiPlayground ready={initialized && !failed}
        onAction={(action, location) => gameRef.current?.uiPlayground(action, location) ?? "Loading the playground…"} />}
      <div ref={hudRef} className="game-hud" hidden={!playing || examPreview} />
      <div ref={controlsRef} className="map-controls" hidden={examPreview}>
        {playing
          ? "Mouse / trackpad look · WASD run · Space jump · Esc menu"
          : "Drag to orbit · Right-drag to pan · Scroll to zoom"}
      </div>
    </>
  );
}
