import { useEffect, useRef, useState } from 'react';
import { Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { disposeMap, loadZurichMap } from '../maps/zurich/loadZurichMap';

/** Owns rendering resources only. No game state, physics or networking. */
export function MapViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('Loading official Zürich 3D map…');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const abort = new AbortController();
    let renderer: WebGLRenderer | undefined;
    let controls: OrbitControls | undefined;
    let resize: ResizeObserver | undefined;
    const scene = new Scene();
    scene.background = new Color('#e8edf1');
    const onContextLost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
      setStatus('WebGL context lost. Reload to restart the viewer.');
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

    async function initialize() {
      try {
        const map = await loadZurichMap(abort.signal);
        if (abort.signal.aborted) { disposeMap(map); return; }
        scene.add(map);
        renderer = new WebGLRenderer({ canvas: canvas!, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        scene.add(new HemisphereLight('#ffffff', '#7c8792', 2));
        const sun = new DirectionalLight('#fff7e6', 2.5);
        sun.position.set(-300, 700, 500);
        scene.add(sun);
        const camera = new PerspectiveCamera(45, 1, 1, 6000);
        camera.position.set(650, 850, 900);
        controls = new OrbitControls(camera, canvas!);
        controls.target.set(0, 25, 0);
        controls.enableDamping = true;
        controls.minDistance = 30;
        controls.maxDistance = 2500;
        controls.maxPolarAngle = Math.PI / 2 - 0.02;
        controls.update();
        const fit = () => {
          const { width, height } = canvas!.getBoundingClientRect();
          renderer!.setSize(Math.max(width, 1), Math.max(height, 1), false);
          camera.aspect = Math.max(width, 1) / Math.max(height, 1);
          camera.updateProjectionMatrix();
        };
        resize = new ResizeObserver(fit);
        resize.observe(canvas!);
        fit();
        renderer.setAnimationLoop(() => { controls!.update(); renderer!.render(scene, camera); });
        setStatus('Map loaded');
      } catch (error) {
        if (abort.signal.aborted) return;
        setFailed(true);
        setStatus(error instanceof Error ? error.message : 'Unable to load the map.');
      }
    }
    void initialize();
    return () => {
      abort.abort();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      renderer?.setAnimationLoop(null);
      resize?.disconnect();
      controls?.dispose();
      disposeMap(scene);
      scene.clear();
      renderer?.dispose();
    };
  }, []);

  return <div className="map-viewer">
    <canvas ref={canvasRef} aria-label="Official 3D map of Zürich between Hauptbahnhof and ETH Zentrum" />
    <div className={`map-status ${failed ? 'error' : ''}`} role={failed ? 'alert' : 'status'}>{status}</div>
    <div className="map-controls">Drag to orbit · Right-drag to pan · Scroll to zoom</div>
  </div>;
}
