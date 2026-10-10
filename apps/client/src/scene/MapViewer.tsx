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
import { MapGame } from "../multiplayer/MapGame";

export function MapViewer() {
  const [playing, setPlaying] = useState(true);
  return (
    <div className="map-viewer">
      <MapCanvas key={playing ? "play" : "inspect"} playing={playing} />
      <button
        className="mode-toggle"
        onClick={() => setPlaying((value) => !value)}
      >
        {playing ? "Inspect map" : "Join multiplayer"}
      </button>
    </div>
  );
}

function MapCanvas({ playing }: { playing: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Loading official Zürich 3D map…");
  const [failed, setFailed] = useState(false);

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
    scene.background = new Color("#aabecb");
    canvas.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        renderer?.setAnimationLoop(null);
        game?.dispose();
        game = undefined;
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
        renderer = new WebGLRenderer({ canvas: canvas!, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = playing;
        renderer.shadowMap.type = PCFShadowMap;
        scene.add(new HemisphereLight("#ffffff", "#7c8792", 2));
        const sun = new DirectionalLight("#fff7e6", 2.5);
        sunlight = sun;
        sun.position.set(-300, 700, 500);
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
        if (playing) game = new MapGame(scene, camera, canvas!, hud!, hints!);
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
          renderer!.setSize(Math.max(width, 1), Math.max(height, 1), false);
          camera.aspect = Math.max(width, 1) / Math.max(height, 1);
          camera.updateProjectionMatrix();
        };
        resize = new ResizeObserver(fit);
        resize.observe(canvas!);
        fit();
        let previous = performance.now();
        renderer.setAnimationLoop(() => {
          const now = performance.now();
          controls?.update();
          game?.update((now - previous) / 1000, now);
          previous = now;
          if (game) {
            const p = game.focus;
            sun.position.set(p.x - 20, p.y + 40, p.z + 20);
            sun.target.position.set(p.x, p.y, p.z);
            sun.target.updateMatrixWorld();
          }
          renderer!.render(scene, camera);
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
      renderer?.setAnimationLoop(null);
      resize?.disconnect();
      controls?.dispose();
      game?.dispose();
      disposeMap(scene);
      sunlight?.shadow.dispose();
      scene.clear();
      renderer?.dispose();
    };
  }, [playing]);

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
      <div ref={hudRef} className="game-hud" hidden={!playing} />
      <div ref={controlsRef} className="map-controls">
        {playing
          ? "Click scene · WASD move · Shift sprint · Space jump · E ride / exit · Drag to turn · Scroll to zoom"
          : "Drag to orbit · Right-drag to pan · Scroll to zoom"}
      </div>
    </>
  );
}
