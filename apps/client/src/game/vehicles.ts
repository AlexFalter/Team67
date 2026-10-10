import {
  BoxGeometry, Color, CylinderGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial,
  type BufferGeometry, type Scene,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as C from "@race/shared";
import { SampleBuffer } from "../net/interp";
import type { StateView } from "../net/Net";

type Part = [w: number, h: number, d: number, x: number, y: number, z: number, color: string, wheel?: boolean];

function build(parts: Part[]): BufferGeometry {
  const color = new Color();
  return mergeGeometries(parts.map(([w, h, d, x, y, z, hex, wheel]) => {
    const g = (wheel ? new CylinderGeometry(h / 2, h / 2, w, 10).rotateZ(Math.PI / 2) : new BoxGeometry(w, h, d)).translate(x, y, z);
    const n = g.getAttribute("position").count, c = new Float32Array(n * 3);
    color.set(hex);
    for (let i = 0; i < n; i++) c.set([color.r, color.g, color.b], i * 3);
    g.setAttribute("color", new Float32BufferAttribute(c, 3));
    return g.index ? g.toNonIndexed() : g;
  }))!;
}

// Vehicles face -Z, origin on the ground.
const wheels = (x: number, z: number, r: number, color = "#22262a"): Part[] =>
  [[-x, -z], [x, -z], [-x, z], [x, z]].map(([wx, wz]) => [0.2, r * 2, r * 2, wx, r, wz, color, true] as Part);
const MODELS: Record<number, Part[]> = {
  [C.CART]: [
    [1.4, 0.45, 2.2, 0, 0.5, 0, "#e8902e"], [1.3, 0.5, 0.15, 0, 1.0, 0.55, "#2f3a44"], [1.3, 0.12, 0.7, 0, 0.78, 0.25, "#2f3a44"],
    [0.06, 1.1, 0.06, -0.62, 1.25, 0.95, "#cfd6db"], [0.06, 1.1, 0.06, 0.62, 1.25, 0.95, "#cfd6db"],
    [0.06, 1.1, 0.06, -0.62, 1.25, -0.6, "#cfd6db"], [0.06, 1.1, 0.06, 0.62, 1.25, -0.6, "#cfd6db"],
    [1.45, 0.08, 1.8, 0, 1.82, 0.15, "#f2f2ee"], [0.8, 0.3, 0.05, 0, 0.95, -0.85, "#9fd3f0"],
    ...wheels(0.7, 0.75, 0.25),
  ],
  [C.BIKE]: [
    [0.08, 0.08, 1.1, 0, 0.75, 0, "#3fbf8f"], [0.08, 0.6, 0.08, 0, 0.6, 0.25, "#3fbf8f"], [0.08, 0.55, 0.08, 0, 0.7, -0.45, "#3fbf8f"],
    [0.6, 0.06, 0.06, 0, 1.0, -0.45, "#30353a"], [0.22, 0.08, 0.3, 0, 0.92, 0.25, "#30353a"],
    [0.07, 0.7, 0.7, 0, 0.35, -0.55, "#22262a", true], [0.07, 0.7, 0.7, 0, 0.35, 0.55, "#22262a", true],
  ],
  [C.SHUTTLE]: [
    [2.6, 0.9, 4.8, 0, 0.75, 0, "#2f88c4"], [2.6, 0.2, 4.8, 0, 1.3, 0, "#f1f1ea"],
    [2.4, 0.3, 4.6, 0, 0.45, 0, "#24526f"],
    [0.1, 1.3, 0.1, -1.25, 2.05, -2.3, "#d6dde2"], [0.1, 1.3, 0.1, 1.25, 2.05, -2.3, "#d6dde2"],
    [0.1, 1.3, 0.1, -1.25, 2.05, 2.3, "#d6dde2"], [0.1, 1.3, 0.1, 1.25, 2.05, 2.3, "#d6dde2"],
    [2.7, 0.15, 5, 0, 2.75, 0, "#2f88c4"], [1.6, 0.4, 0.1, 0, 2.5, -2.45, "#ffcc44"],
    ...[-1.25, 0, 1.25].flatMap(z => [[0.5, 0.15, 0.5, -0.65, 1.0, z, "#5a3e2b"], [0.5, 0.15, 0.5, 0.65, 1.0, z, "#5a3e2b"]] as Part[]),
    ...wheels(1.2, 1.7, 0.35),
  ],
  [C.TRAFFIC]: [
    [1.8, 0.7, 4.2, 0, 0.75, 0, "#c0392b"], [1.6, 0.6, 2.2, 0, 1.4, 0.2, "#c0392b"], [1.62, 0.45, 2.0, 0, 1.4, 0.2, "#a9d4ee"],
    [1.7, 0.15, 0.1, 0, 0.8, -2.12, "#f7f3c6"], ...wheels(0.85, 1.4, 0.33),
  ],
};

export class VehicleView {
  readonly buffer = new SampleBuffer();
  readonly pose: C.VehicleBody;
  driver = "";
  dir = 0;
  tripStart = 0;
  departAt = 0;
  fallenUntil = 0;
  constructor(readonly id: string, readonly kind: number, readonly mesh: Mesh) {
    this.pose = { kind, x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0 };
  }
}

/** Vehicle meshes (one shared geometry per kind) and their poses each frame. */
export class Vehicles {
  readonly all = new Map<string, VehicleView>();
  private geometries = new Map<number, BufferGeometry>();
  private material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true });
  private pads: Mesh[] = [];
  private trafficStart = 0;

  constructor(private scene: Scene) {
    for (const [kind, parts] of Object.entries(MODELS)) this.geometries.set(Number(kind), build(parts));
    C.zurichWorld.stops.forEach((stop, i) => {
      const pad = new Mesh(new BoxGeometry(5, 0.1, 7), new MeshStandardMaterial({ color: i ? "#4e8fd1" : "#e3a33f", roughness: 1 }));
      pad.position.set(stop.x, stop.y + 0.05, stop.z);
      pad.receiveShadow = true;
      scene.add(pad);
      this.pads.push(pad);
    });
  }

  ingest(state: StateView) {
    this.trafficStart = state.trafficStart;
    for (const [id, v] of state.vehicles) {
      let view = this.all.get(id);
      if (!view || view.kind !== v.kind) {
        if (view) view.mesh.removeFromParent();
        const mesh = new Mesh(this.geometries.get(v.kind), this.material);
        mesh.castShadow = mesh.receiveShadow = true;
        this.scene.add(mesh);
        view = new VehicleView(id, v.kind, mesh);
        this.all.set(id, view);
      }
      view.driver = v.driver; view.dir = v.dir; view.tripStart = v.tripStart; view.departAt = v.departAt; view.fallenUntil = v.fallenUntil;
      view.buffer.push(v.t, v.x, v.y, v.z, v.vx, 0, v.vz, v.yaw);
    }
    for (const [id, view] of this.all)
      if (!state.vehicles.has(id)) { view.mesh.removeFromParent(); this.all.delete(id); }
  }

  /** New round: everything was reset on the server. */
  clear() {
    for (const v of this.all.values()) v.buffer.clear();
  }

  /**
   * Shuttle and traffic come from the server schedule at the current server time (exact on every client);
   * driven carts/bikes interpolate on the remote timeline; my own vehicle comes from my simulation.
   */
  update(renderTime: number, serverNow: number, mine?: { id: string; pose: C.VehicleBody }) {
    for (const v of this.all.values()) {
      const p = v.pose;
      if (v.kind === C.SHUTTLE) C.shuttlePose(C.zurichWorld, v.dir, v.tripStart, serverNow, p);
      else if (v.kind === C.TRAFFIC) C.trafficPose(C.zurichWorld, this.trafficStart, serverNow, p);
      else if (mine && mine.id === v.id) { p.x = mine.pose.x; p.y = mine.pose.y; p.z = mine.pose.z; p.yaw = mine.pose.yaw; p.vx = mine.pose.vx; p.vz = mine.pose.vz; }
      else v.buffer.sample(renderTime, p);
      v.mesh.position.set(p.x, p.y, p.z);
      v.mesh.rotation.set(0, p.yaw, v.kind === C.BIKE && serverNow < v.fallenUntil ? Math.PI / 2 - 0.1 : 0, "YXZ");
    }
  }

  /** Closest vehicle I could board, if any. */
  nearest(x: number, y: number, z: number, serverNow: number) {
    let best: VehicleView | undefined, bestD = Infinity;
    for (const v of this.all.values()) {
      if (v.kind === C.TRAFFIC || serverNow < v.fallenUntil) continue;
      const d = Math.hypot(v.pose.x - x, v.pose.z - z) - (C.vehicleRadius(v.kind) - C.CART_RADIUS);
      if (d < C.BOARD_DISTANCE && Math.abs(v.pose.y - y) < C.BOARD_HEIGHT + 1 && d < bestD) { best = v; bestD = d; }
    }
    return best;
  }

  dispose() {
    for (const v of this.all.values()) v.mesh.removeFromParent();
    for (const pad of this.pads) { pad.removeFromParent(); pad.geometry.dispose(); (pad.material as MeshStandardMaterial).dispose(); }
    this.geometries.forEach(g => g.dispose());
    this.material.dispose();
  }
}
