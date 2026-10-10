import data from "./zurich-world.json";
import { HEIGHT, RADIUS, SPAWN_SPREAD } from "./constants.ts";

export interface Point { x: number; y: number; z: number }
export interface Pose extends Point { yaw: number }

/** Gameplay collision: a height field plus "is a capsule here inside a building". No meshes. */
export interface World {
  spawn: Point;
  carts: readonly Point[];
  stops: readonly Point[];
  route: readonly Point[];
  routeLength: number;
  /** Walkable ground height, or NaN where there is none (outside the map). */
  height(x: number, z: number): number;
  /** True if a capsule (feet at y) overlaps an obstacle column. */
  blocked(x: number, y: number, z: number, radius: number, height: number): boolean;
}

const NONE = 65535;
// Obstacle columns are cells whose roof stands at least this far above the ground (cm).
const MIN_OBSTACLE_CM = 150;

function decode(base64: string) {
  const bytes = atob(base64), out = new Uint16Array(bytes.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = bytes.charCodeAt(2 * i) | (bytes.charCodeAt(2 * i + 1) << 8);
  return out;
}

function cumulative(route: readonly Point[]) {
  const d = [0];
  for (let i = 1; i < route.length; i++)
    d.push(d[i - 1] + Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z));
  return d;
}

const routeDistance = new WeakMap<World, number[]>();

function gridWorld(): World {
  const { minX, minZ, step, width, depth } = data;
  const ground = decode(data.ground), roof = decode(data.roof);
  const distances = cumulative(data.route);
  const world: World = {
    spawn: data.spawn,
    carts: data.carts,
    stops: data.stops,
    route: data.route,
    routeLength: distances[distances.length - 1],
    height(x, z) {
      const gx = (x - minX) / step, gz = (z - minZ) / step;
      if (!(gx >= 0 && gz >= 0 && gx <= width - 1 && gz <= depth - 1)) return NaN;
      const ix = Math.min(width - 2, gx | 0), iz = Math.min(depth - 2, gz | 0);
      const fx = gx - ix, fz = gz - iz, i = iz * width + ix;
      const a = ground[i], b = ground[i + 1], c = ground[i + width], d = ground[i + width + 1];
      if (a === NONE || b === NONE || c === NONE || d === NONE) return NaN;
      return ((a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz) / 100;
    },
    blocked(x, y, z, radius, height) {
      const x0 = Math.max(0, Math.round((x - radius - minX) / step)), x1 = Math.min(width - 1, Math.round((x + radius - minX) / step));
      const z0 = Math.max(0, Math.round((z - radius - minZ) / step)), z1 = Math.min(depth - 1, Math.round((z + radius - minZ) / step));
      const feet = y * 100, head = (y + height) * 100;
      for (let gz = z0; gz <= z1; gz++)
        for (let gx = x0; gx <= x1; gx++) {
          const i = gz * width + gx, g = ground[i], r = roof[i];
          if (r !== NONE && g !== NONE && r > g + MIN_OBSTACLE_CM && feet < r + 10 && head > g) return true;
        }
      return false;
    },
  };
  routeDistance.set(world, distances);
  return world;
}

export const zurichWorld = gridWorld();

/** A flat square with optional box obstacles, for tests. */
export function flatWorld(size = 200, boxes: { x: number; z: number; w: number; d: number; h: number }[] = []): World {
  const half = size / 2, origin = { x: 0, y: 0, z: 0 };
  const route = [{ x: -10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }];
  const world: World = {
    spawn: origin, carts: [{ x: 5, y: 0, z: 5 }], stops: route, route, routeLength: 20,
    height: (x, z) => (Math.abs(x) <= half && Math.abs(z) <= half ? 0 : NaN),
    blocked(x, y, z, radius, height) {
      for (const b of boxes)
        if (Math.abs(x - b.x) < b.w / 2 + radius && Math.abs(z - b.z) < b.d / 2 + radius && y < b.h && y + height > 0) return true;
      return false;
    },
  };
  routeDistance.set(world, cumulative(route));
  return world;
}

/** Nearest free ground around (x, z), searched in rings. */
export function findGround(world: World, x: number, z: number, radius = RADIUS): Point | undefined {
  for (let ring = 0; ring <= 8; ring++)
    for (let k = 0, n = ring ? 16 : 1; k < n; k++) {
      const a = (k / n) * Math.PI * 2, px = x + Math.cos(a) * ring, pz = z + Math.sin(a) * ring;
      const y = world.height(px, pz);
      if (!Number.isNaN(y) && !world.blocked(px, y, pz, radius, HEIGHT)) return { x: px, y, z: pz };
    }
  return undefined;
}

export function spawnPoint(world: World, random = Math.random): Point {
  for (let i = 0; i < 12; i++) {
    const p = findGround(world, world.spawn.x + (random() - 0.5) * SPAWN_SPREAD, world.spawn.z + (random() - 0.5) * SPAWN_SPREAD);
    if (p) return p;
  }
  return { ...world.spawn };
}

/** Point at distance d along the route (reverse = travelling back from the end). Yaw faces travel. */
export function routePoint(world: World, d: number, reverse: boolean, out: Pose) {
  const dist = routeDistance.get(world)!, route = world.route, L = world.routeLength;
  const at = Math.max(0, Math.min(L, reverse ? L - d : d));
  let lo = 0, hi = route.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (dist[mid] <= at) lo = mid; else hi = mid - 1;
  }
  const a = route[lo], b = route[lo + 1], len = dist[lo + 1] - dist[lo], f = len > 0 ? (at - dist[lo]) / len : 0;
  out.x = a.x + (b.x - a.x) * f;
  out.z = a.z + (b.z - a.z) * f;
  const g = world.height(out.x, out.z);
  out.y = Number.isNaN(g) ? a.y + (b.y - a.y) * f : g;
  const s = reverse ? -1 : 1;
  out.yaw = yawOf((b.x - a.x) * s, (b.z - a.z) * s);
}

/** Yaw convention for everything: forward = (-sin yaw, 0, -cos yaw), like a three.js camera. */
export function yawOf(dx: number, dz: number) {
  return Math.atan2(-dx, -dz);
}
