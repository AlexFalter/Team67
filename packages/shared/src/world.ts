import data from "./zurich-world.json";
import * as C from "./constants.ts";
import { passageFloor } from "./transit.ts";
import { MATE_POSITION, mateBlocked } from "./mate.ts";
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
const ground = decode(data.ground),
  roof = decode(data.roof);
function groundHeight(x: number, z: number) {
  const gx = (x - data.minX) / data.step,
    gz = (z - data.minZ) / data.step;
  if (gx < 0 || gz < 0 || gx > data.width - 1 || gz > data.depth - 1)
    return undefined;
  const ix = Math.min(data.width - 2, Math.floor(gx)),
    iz = Math.min(data.depth - 2, Math.floor(gz)),
    fx = gx - ix,
    fz = gz - iz;
  const a = ground[iz * data.width + ix],
    b = ground[iz * data.width + ix + 1],
    c = ground[(iz + 1) * data.width + ix],
    d = ground[(iz + 1) * data.width + ix + 1];
  if (a === 65535 || b === 65535 || c === 65535 || d === 65535)
    return undefined;
  return ((a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz) / 100;
}
function blocked(
  x: number,
  y: number,
  z: number,
  radius: number,
  height: number,
) {
  const minX = Math.max(0, Math.round((x - radius - data.minX) / data.step)),
    maxX = Math.min(
      data.width - 1,
      Math.round((x + radius - data.minX) / data.step),
    );
  const minZ = Math.max(0, Math.round((z - radius - data.minZ) / data.step)),
    maxZ = Math.min(
      data.depth - 1,
      Math.round((z + radius - data.minZ) / data.step),
    );
  for (let gz = minZ; gz <= maxZ; gz++)
    for (let gx = minX; gx <= maxX; gx++) {
      const index = gz * data.width + gx,
        g = ground[index],
        r = roof[index];
      if (
        r !== 65535 &&
        g !== 65535 &&
        r > g + 150 &&
        y < r / 100 + 0.1 &&
        y + height > g / 100
      )
        return true;
    }
  return false;
}
const distances = [0];
const mateGround = groundHeight(MATE_POSITION.x, MATE_POSITION.z)!;
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
  height: (x, z) => passageFloor(x, z) ?? groundHeight(x, z),
  blocked: (x, y, z, radius, height) => {
    if (mateBlocked(x, y, z, radius, height, mateGround)) return true;
    const floor = passageFloor(x, z);
    if (floor !== undefined && y >= floor - 0.5 && y + height <= floor + 4.4 &&
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
