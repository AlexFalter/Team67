import data from "./zurich-world.json";
import * as C from "./constants.ts";
export interface GroundPoint {
  x: number;
  y: number;
  z: number;
}
export interface MovementWorld {
  name: "flat" | "zurich";
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  spawn: GroundPoint;
  carts: readonly GroundPoint[];
  stops: readonly GroundPoint[];
  route: readonly GroundPoint[];
  routeDistances: readonly number[];
  routeLength: number;
  height(x: number, z: number): number | undefined;
  blocked(
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
  ): boolean;
}
export const flatWorld: MovementWorld = {
  name: "flat",
  bounds: {
    minX: -C.PLANE_SIZE / 2,
    maxX: C.PLANE_SIZE / 2,
    minZ: -C.PLANE_SIZE / 2,
    maxZ: C.PLANE_SIZE / 2,
  },
  spawn: { x: 0, y: 0, z: 0 },
  carts: C.CART_SPAWNS.map((p) => ({ ...p, y: 0 })),
  stops: C.SHUTTLE_STOPS.map((p) => ({ ...p, y: 0 })),
  route: C.SHUTTLE_STOPS.map((p) => ({ ...p, y: 0 })),
  routeDistances: [0, 24],
  routeLength: 24,
  height: (x, z) =>
    Math.abs(x) <= C.PLANE_SIZE / 2 && Math.abs(z) <= C.PLANE_SIZE / 2
      ? 0
      : undefined,
  blocked: () => false,
};
function decode(encoded: string) {
  const binary = atob(encoded),
    values = new Uint16Array(binary.length / 2);
  for (let i = 0; i < values.length; i++)
    values[i] = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
  return values;
}
interface HeightGrid {
  minX: number; minZ: number; step: number; width: number; depth: number;
  ground: Uint16Array; roof: Uint16Array;
}
type EncodedGrid = Omit<HeightGrid, "ground" | "roof"> & { ground: string; roof: string };
const grid = (g: EncodedGrid): HeightGrid => ({ ...g, ground: decode(g.ground), roof: decode(g.roof) });
// The 2 m map grid plus 0.5 m detail patches (Polybahn stations) that override it where they cover a point.
const coarse = grid(data as EncodedGrid);
const patches = ((data as { patches?: EncodedGrid[] }).patches ?? []).map(grid);
function covering(x: number, z: number, margin = 0) {
  for (const p of patches)
    if (x - margin >= p.minX && z - margin >= p.minZ &&
      x + margin <= p.minX + (p.width - 1) * p.step && z + margin <= p.minZ + (p.depth - 1) * p.step) return p;
  return coarse;
}
function gridHeight(g: HeightGrid, x: number, z: number) {
  const gx = (x - g.minX) / g.step,
    gz = (z - g.minZ) / g.step;
  if (gx < 0 || gz < 0 || gx > g.width - 1 || gz > g.depth - 1)
    return undefined;
  const ix = Math.min(g.width - 2, Math.floor(gx)),
    iz = Math.min(g.depth - 2, Math.floor(gz)),
    fx = gx - ix,
    fz = gz - iz;
  const a = g.ground[iz * g.width + ix],
    b = g.ground[iz * g.width + ix + 1],
    c = g.ground[(iz + 1) * g.width + ix],
    d = g.ground[(iz + 1) * g.width + ix + 1];
  if (a === 65535 || b === 65535 || c === 65535 || d === 65535)
    return undefined;
  return ((a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz) / 100;
}
function groundHeight(x: number, z: number) {
  return gridHeight(covering(x, z), x, z);
}
function blocked(
  x: number,
  y: number,
  z: number,
  radius: number,
  height: number,
) {
  const g = covering(x, z, radius);
  // 2 m grid: any cell the capsule touches (conservative). Fine patches: cells whose centre is inside
  // the capsule's square, so walls are at most half a cell (0.25 m) thicker than they look.
  const lo = g === coarse ? Math.round : Math.ceil, hi = g === coarse ? Math.round : Math.floor;
  const minX = Math.max(0, lo((x - radius - g.minX) / g.step)),
    maxX = Math.min(g.width - 1, hi((x + radius - g.minX) / g.step));
  const minZ = Math.max(0, lo((z - radius - g.minZ) / g.step)),
    maxZ = Math.min(g.depth - 1, hi((z + radius - g.minZ) / g.step));
  for (let gz = minZ; gz <= maxZ; gz++)
    for (let gx = minX; gx <= maxX; gx++) {
      const index = gz * g.width + gx,
        ground = g.ground[index],
        roof = g.roof[index];
      if (
        roof !== 65535 &&
        ground !== 65535 &&
        roof > ground + 150 &&
        y < roof / 100 + 0.1 &&
        y + height > ground / 100
      )
        return true;
    }
  return false;
}
const distances = [0];
for (let i = 1; i < data.route.length; i++)
  distances.push(
    distances[i - 1] +
      Math.hypot(
        data.route[i].x - data.route[i - 1].x,
        data.route[i].z - data.route[i - 1].z,
      ),
  );
export const zurichWorld: MovementWorld = {
  name: "zurich",
  bounds: data,
  spawn: data.spawn,
  carts: data.carts,
  stops: data.stops,
  route: data.route,
  routeDistances: distances,
  routeLength: distances.at(-1)!,
  height: groundHeight,
  blocked,
};
export function findGround(
  world: MovementWorld,
  x: number,
  z: number,
  radius = 0.5,
): GroundPoint | undefined {
  for (let ring = 0; ring <= 8; ring++)
    for (let direction = 0; direction < (ring === 0 ? 1 : 16); direction++) {
      const angle = (direction / 16) * Math.PI * 2,
        px = x + Math.cos(angle) * ring,
        pz = z + Math.sin(angle) * ring,
        y = world.height(px, pz);
      if (
        y !== undefined &&
        !world.blocked(px, y, pz, radius, C.CAPSULE_HEIGHT)
      )
        return { x: px, y, z: pz };
    }
  return undefined;
}
export function spawnPoint(world: MovementWorld) {
  for (let i = 0; i < 12; i++) {
    const p = findGround(
      world,
      world.spawn.x + (Math.random() - 0.5) * C.SPAWN_SPREAD,
      world.spawn.z + (Math.random() - 0.5) * C.SPAWN_SPREAD,
    );
    if (p) return p;
  }
  return { ...world.spawn };
}
export function routePoint(
  world: MovementWorld,
  distance: number,
  out: { x: number; y: number; z: number; rotY: number },
  reverse = false,
) {
  const d = Math.max(
    0,
    Math.min(
      world.routeLength,
      reverse ? world.routeLength - distance : distance,
    ),
  );
  let lo = 0,
    hi = world.route.length - 2;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (world.routeDistances[mid] <= d) lo = mid;
    else hi = mid - 1;
  }
  const a = world.route[lo],
    b = world.route[lo + 1],
    length = world.routeDistances[lo + 1] - world.routeDistances[lo],
    f = length > 0 ? (d - world.routeDistances[lo]) / length : 0;
  out.x = a.x + (b.x - a.x) * f;
  out.z = a.z + (b.z - a.z) * f;
  out.y = world.height(out.x, out.z) ?? a.y + (b.y - a.y) * f;
  out.rotY = Math.atan2(
    (b.x - a.x) * (reverse ? -1 : 1),
    (b.z - a.z) * (reverse ? -1 : 1),
  );
}
