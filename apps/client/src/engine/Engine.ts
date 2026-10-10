import {
  Color, DirectionalLight, Fog, HemisphereLight, PCFShadowMap, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
  type Mesh, type Object3D,
} from "three";
import { activeTheme } from "../maps/zurich/theme";
import { disposeObject, loadMap } from "./mapLoader";

/** What runs inside the one animation loop: inspect (orbit) or play. */
export interface Mode {
  frame(dt: number, now: number): void;
  dispose(): void;
}

/** Owns the renderer, scene, camera, lights, map and the single animation loop. */
export class Engine {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(75, 1, 0.05, 4000);
  readonly renderer: WebGLRenderer;
  /** Shadow camera follows this point. */
  readonly focus = new Vector3();
  colliders: Mesh[] = [];
  /** Frame stats for the debug overlay. */
  readonly stats = { fps: 0, cpuMs: 0, calls: 0, triangles: 0 };
  private map?: Object3D;
  private mode?: Mode;
  private sun: DirectionalLight;
  private sunDir = new Vector3();
  private resize: ResizeObserver;
  private last = 0;
  private frames = 0;
  private fpsTime = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const theme = activeTheme(), light = theme.lighting;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.scene.background = new Color(theme.sky);
    this.scene.fog = new Fog(theme.sky, 600, 2600);
    this.scene.add(new HemisphereLight(light.skyLight, light.groundLight, light.hemiIntensity));
    this.sun = new DirectionalLight(light.sun, light.sunIntensity);
    // Theme azimuth is clockwise from north; map north is -Z.
    const el = (light.sunElevation * Math.PI) / 180, az = (light.sunAzimuth * Math.PI) / 180;
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 200 });
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(canvas);
    this.fit();
    this.renderer.setAnimationLoop(now => this.loop(now));
  }

  async load(signal: AbortSignal, progress: (fraction: number, label: string) => void) {
    const { map, colliders } = await loadMap(activeTheme(), signal, progress);
    if (signal.aborted) { disposeObject(map); signal.throwIfAborted(); }
    this.map = map;
    this.colliders = colliders;
    this.scene.add(map);
  }

  setFog(near: number, far: number) {
    const fog = this.scene.fog as Fog;
    fog.near = near;
    fog.far = far;
  }

  setMode(mode: Mode | undefined) {
    this.mode?.dispose();
    this.mode = mode;
  }

  private fit() {
    const w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop(now: number) {
    const dt = this.last ? Math.min(0.25, (now - this.last) / 1000) : 0;
    this.last = now;
    const start = performance.now();
    this.mode?.frame(dt, now);
    const f = this.focus, d = this.sunDir;
    this.sun.position.set(f.x + d.x * 100, f.y + d.y * 100, f.z + d.z * 100);
    this.sun.target.position.copy(f);
    this.sun.target.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
    const s = this.stats;
    s.cpuMs += (performance.now() - start - s.cpuMs) * 0.1;
    s.calls = this.renderer.info.render.calls;
    s.triangles = this.renderer.info.render.triangles;
    this.frames++;
    if (now - this.fpsTime >= 500) {
      s.fps = (this.frames * 1000) / (now - this.fpsTime);
      this.frames = 0;
      this.fpsTime = now;
    }
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.setMode(undefined);
    this.resize.disconnect();
    if (this.map) disposeObject(this.map);
    this.sun.shadow.dispose();
    this.scene.clear();
    this.renderer.dispose();
  }
}
