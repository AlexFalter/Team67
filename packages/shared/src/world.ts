import {bagHillLift} from "./bags.ts";
import {fruitStandBlocked} from './fruit.ts';
import data from "./zurich-world.json";
import * as C from "./constants.ts";
import { raceSpawnPoint } from "./battleBus.ts";
import { passageFloor, polybahnPassages, polybahnPlatforms } from "./transit.ts";
import { MATE_POSITION, mateBlocked } from "./mate.ts";
import { TICKET_POSITION, ticketBlocked } from './ticket.ts';
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
  /** ground under (x, z); with `y` (feet) and stacked surfaces, the one at or below that level */
  height(x: number, z: number, y?: number): number | undefined;
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
  // Across a cliff (terrace or quay wall, > 1 m between corners) blending would sag the upper ground
  // towards the lower one and sink players into the wall: use the nearest corner instead.
  if (Math.max(a, b, c, d) - Math.min(a, b, c, d) > 100)
    return (fz < 0.5 ? (fx < 0.5 ? a : b) : (fx < 0.5 ? c : d)) / 100;
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
const mateGround = groundHeight(MATE_POSITION.x, MATE_POSITION.z)!;
const ticketGround = groundHeight(TICKET_POSITION.x, TICKET_POSITION.z)!;
for (let i = 1; i < data.route.length; i++)
  distances.push(
    distances[i - 1] +
      Math.hypot(
        data.route[i].x - data.route[i - 1].x,
        data.route[i].z - data.route[i - 1].z,
      ),
  );
// Within the walkable track corridor (not a 2.1 m platform connector), see transit.ts. Inside the two
// Polybahn station areas (the 0.5 m patches that contain a boarding platform) only the cabin opening
// around the track centre counts, so the corridor's full width does not cut through the station walls.
const stationPatches = patches.filter((p) => polybahnPlatforms.some((q) =>
  q.x >= p.minX && q.z >= p.minZ && q.x <= p.minX + (p.width - 1) * p.step && q.z <= p.minZ + (p.depth - 1) * p.step));
function onTrack(x: number, z: number) {
  const inStation = stationPatches.some((p) => x >= p.minX && z >= p.minZ &&
    x <= p.minX + (p.width - 1) * p.step && z <= p.minZ + (p.depth - 1) * p.step);
  for (const s of polybahnPassages) {
    if (s.width < 3) continue;
    const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, length = Math.hypot(dx, dz);
    const along = ((x - s.a.x) * dx + (z - s.a.z) * dz) / length;
    if (along < -0.2 || along > length + 0.2) continue;
    if (Math.abs((-(x - s.a.x) * dz + (z - s.a.z) * dx) / length) <= (inStation ? 1.0 : s.width)) return true;
  }
  return false;
}
export const zurichWorld: MovementWorld = {
  name: "zurich",
  bounds: data,
  spawn: data.spawn,
  carts: data.carts,
  stops: data.stops,
  route: data.route,
  routeDistances: distances,
  routeLength: distances.at(-1)!,
  // Two stacked surfaces: the map's walk grid (streets, Polybahn hall floors, ramps) and the walkable
  // Polybahn track corridor (transit.ts passageFloor). With the body's height `y`, stand on the highest
  // surface at or just above the feet; e.g. the street under the Polybahn bridge vs. the track above it,
  // or a hall floor vs. the corridor floor below it. Without `y` (placement queries) the corridor wins.
  height: (x, z, y) => {
    const floor = passageFloor(x, z), native = groundHeight(x, z), ground = native === undefined ? undefined : native + bagHillLift(x,z);
    if (floor === undefined || ground === undefined) return floor ?? ground;
    if (y === undefined) return floor;
    const reach = y + C.MAX_GROUND_STEP;
    if (floor <= reach && ground <= reach) return Math.max(floor, ground);
    if (floor <= reach) return floor;
    if (ground <= reach) return ground;
    return Math.min(floor, ground);
  },
  blocked: (x, y, z, radius, height) => {
    if(fruitStandBlocked(x,y,z,radius,height))return true;
    if (mateBlocked(x, y, z, radius, height, mateGround)) return true;
    if (ticketBlocked(x, y, z, radius, height, ticketGround)) return true;
    const floor = passageFloor(x, z);
    // Walls are ignored along the walkable Polybahn TRACK (its structure is a wall in the walk grid), but
    // not on the narrow platform connectors inside the station halls: there the real hall floors and walls
    // of the walk grid apply, so nobody slips through the door jambs or hall walls.
    if (floor !== undefined && onTrack(x, z) && y >= floor - 0.5 && y + height <= floor + 4.4 &&
      [[-radius, -radius], [-radius, radius], [radius, -radius], [radius, radius]].every(([dx, dz]) => passageFloor(x + dx, z + dz) !== undefined)) return false;
    return blocked(x, y, z, radius, height);
  },
};
// Offline route generation must query the original export, not its own passages.
export const zurichNativeHeight = groundHeight;
export const zurichNativeBlocked = blocked;
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
  const spawn = raceSpawnPoint(world);
  for (let i = 0; i < 12; i++) {
    const p = findGround(
      world,
      spawn.x + (Math.random() - 0.5) * C.SPAWN_SPREAD,
      spawn.z + (Math.random() - 0.5) * C.SPAWN_SPREAD,
    );
    if (p) return p;
  }
  return { ...spawn };
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
