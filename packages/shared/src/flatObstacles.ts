import type { Body } from "./types.ts";
import { CAPSULE_RADIUS, CAPSULE_HEIGHT } from "./constants.ts";

// Shared collision proxies also define the visible Three.js meshes. A map can
// supply its own boxes when this prototype is merged into the larger world.
export const HOUSES = [
  { x: -15, z: -13, width: 7, depth: 6, height: 5 },
  { x: 14, z: -12, width: 6, depth: 8, height: 7 },
  { x: 17, z: 19, width: 8, depth: 5, height: 4 },
];

export function resolveHouses(p: Pick<Body, "x" | "y" | "z" | "vx" | "vy" | "vz" | "grounded">,
  previous: { x: number; y: number; z: number }, radius = CAPSULE_RADIUS) {
  for (const h of HOUSES) {
    const left = h.x - h.width / 2 - radius, right = h.x + h.width / 2 + radius;
    const back = h.z - h.depth / 2 - radius, front = h.z + h.depth / 2 + radius;
    if (p.x <= left || p.x >= right || p.z <= back || p.z >= front || p.y >= h.height || p.y + CAPSULE_HEIGHT <= 0) continue;
    if (previous.y >= h.height && p.vy <= 0) {
      p.y = h.height; p.vy = 0; p.grounded = true;
    } else if (previous.x <= left) { p.x = left; p.vx = 0; }
    else if (previous.x >= right) { p.x = right; p.vx = 0; }
    else if (previous.z <= back) { p.z = back; p.vz = 0; }
    else if (previous.z >= front) { p.z = front; p.vz = 0; }
    else {
      const distances = [p.x - left, right - p.x, p.z - back, front - p.z];
      const side = distances.indexOf(Math.min(...distances));
      if (side < 2) { p.x = side === 0 ? left : right; p.vx = 0; }
      else { p.z = side === 2 ? back : front; p.vz = 0; }
    }
  }
}
