import water from "./water.json";
import type { MovementWorld } from "./world.ts";

// Falling into the lake, the Limmat, the Sihl or the Schanzengraben drowns a player on foot.
// The OSM outlines are only approximate relative to the Blender map, so a point also has to be at
// the water level of its water body: the walk grid flattens each one (water_quays.py) to its lowest
// heights, while banks, quays, bridge decks and land the outlines overlap stand at least ~1.5 m higher.
// A local "lowest ground nearby" check is not enough: on a wide bridge deck everything nearby is deck.

/** How long a drowned player waits (with the meme music) before respawning at the start. */
export const DROWN_RESPAWN_MS = 10_000;
/** Feet within this height of the water surface count as "in the water". */
const SURFACE_TOLERANCE = 0.4;
/** Ground within this height of the water body's surface is water, not a bank or bridge. */
const LEVEL_TOLERANCE = 1.5;

type Point = readonly [number, number];
const polygons = (water.polygons as unknown as Point[][]).map((points, i) => {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of points) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return { points, minX, maxX, minZ, maxZ, level: (water as { levels?: number[] }).levels?.[i] ?? -Infinity };
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
  return waterBodyAt(x, z) !== undefined;
}

function waterBodyAt(x: number, z: number) {
  return polygons.find((p) => x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ && insidePolygon(p.points, x, z));
}

/**
 * Surface of each water body: the lowest walk-grid height inside its outline. Too slow to sample at
 * runtime (~2 s for the Limmat), so it is baked into water.json as `levels`; rerun this after the
 * walk grid or the outlines change.
 */
export function waterSurfaceLevels(world: MovementWorld) {
  return polygons.map((body) => {
    const step = Math.min(2, Math.max(0.5, Math.min(body.maxX - body.minX, body.maxZ - body.minZ) / 8));
    let level = Infinity;
    for (let x = body.minX; x <= body.maxX; x += step)
      for (let z = body.minZ; z <= body.maxZ; z += step) {
        if (!insidePolygon(body.points, x, z)) continue;
        const h = world.height(x, z);
        if (h !== undefined && h < level) level = h;
      }
    return level;
  });
}

/** Feet at (x, y, z) are in the water: inside a water outline, at its water level and not above it. */
export function inWater(world: MovementWorld, x: number, y: number, z: number) {
  if (world.name !== "zurich") return false;
  const body = waterBodyAt(x, z);
  if (!body) return false;
  const ground = world.height(x, z);
  if (ground === undefined || y > ground + SURFACE_TOLERANCE) return false;
  return ground < body.level + LEVEL_TOLERANCE;
}
