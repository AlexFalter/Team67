import water from "./water.json";
import type { MovementWorld } from "./world.ts";

// Falling into the lake, the Limmat, the Sihl or the Schanzengraben drowns a player on foot.
// The OSM outlines are only approximate relative to the Blender map, so a point also has to be at
// the local water level: the walk grid flattens each water body (water_quays.py), while banks, quays
// and bridge decks over the river stand clearly above the lowest ground a few metres away.

/** How long a drowned player waits (with the meme music) before respawning at the start. */
export const DROWN_RESPAWN_MS = 10_000;
/** Feet within this height of the water surface count as "in the water". */
const SURFACE_TOLERANCE = 0.4;
/** Ground within this height of the local minimum is water level, not a bank or bridge. */
const LEVEL_TOLERANCE = 0.6;
const PROBE = [[4, 0], [-4, 0], [0, 4], [0, -4], [3, 3], [3, -3], [-3, 3], [-3, -3],
  [8, 0], [-8, 0], [0, 8], [0, -8]] as const;

type Point = readonly [number, number];
const polygons = (water.polygons as unknown as Point[][]).map((points) => {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of points) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return { points, minX, maxX, minZ, maxZ };
});

function insidePolygon(points: readonly Point[], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, az] = points[i], [bx, bz] = points[j];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

/** (x, z) lies inside one of the mapped water bodies (outline only, ignores height). */
export function overWater(x: number, z: number) {
  return polygons.some((p) => x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ && insidePolygon(p.points, x, z));
}

/** Feet at (x, y, z) are in the water: inside a water outline, at the water level and not above it. */
export function inWater(world: MovementWorld, x: number, y: number, z: number) {
  if (world.name !== "zurich" || !overWater(x, z)) return false;
  const ground = world.height(x, z);
  if (ground === undefined || y > ground + SURFACE_TOLERANCE) return false;
  let lowest = ground;
  for (const [dx, dz] of PROBE) {
    const h = world.height(x + dx, z + dz);
    if (h !== undefined && h < lowest) lowest = h;
  }
  return ground - lowest < LEVEL_TOLERANCE;
}
