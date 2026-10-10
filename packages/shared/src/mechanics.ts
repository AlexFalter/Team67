import * as C from "./constants.ts";
import { flatWorld, type MovementWorld } from "./world.ts";
import { HOUSES } from "./flatObstacles.ts";
import type { PlayerState } from "./types.ts";
type Position = Pick<PlayerState, "x" | "y" | "z">;

export function blockedByHouse(a: Position, b: Position) {
  for (const h of HOUSES) {
    let near = 0, far = 1;
    for (const [axis, half] of [["x", h.width / 2], ["z", h.depth / 2]] as const) {
      const delta = b[axis] - a[axis], min = h[axis] - half, max = h[axis] + half;
      if (Math.abs(delta) < 1e-8) { if (a[axis] < min || a[axis] > max) { near = 2; break; } }
      else {
        const u = (min - a[axis]) / delta, v = (max - a[axis]) / delta;
        near = Math.max(near, Math.min(u, v)); far = Math.min(far, Math.max(u, v));
      }
    }
    if (near <= far && Math.min(a.y, b.y) < h.height) return true;
  }
  return false;
}
export function inHitCone(a: Position & { rotY: number }, b: Position, world: MovementWorld = flatWorld) {
  const dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz);
  return Math.abs(b.y - a.y) < 1.2 && distance <= C.ATTACK_RANGE &&
    (distance < 0.001 || (dx * Math.sin(a.rotY) + dz * Math.cos(a.rotY)) / distance >= Math.cos(C.ATTACK_HALF_ANGLE)) &&
    !(world.name === "flat" ? blockedByHouse(a, b) : Array.from({ length: Math.ceil(distance / 0.5) }, (_, i) => {
      const f = (i + 1) / Math.ceil(distance / 0.5);
      return world.blocked(a.x + dx * f, a.y + 0.8, a.z + dz * f, 0.1, 0.2);
    }).some(Boolean));
}
