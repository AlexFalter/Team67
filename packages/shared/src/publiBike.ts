import { CAPSULE_HEIGHT } from "./constants.ts";
import type { MovementWorld } from "./world.ts";

export const PUBLI_BIKE_COUNT = 8;
export const PUBLI_BIKE_BATTERY_MS = 15000;
export const PUBLI_BIKE_LEASE_MS = 30000;
export const PUBLI_BIKE_SCAN_MS = 2050;
export const PUBLI_BIKE_RANGE = 2.8;
export interface PubliBikeState {
  broken: boolean;
  batteryMs: number;
  reservedBy: string;
  reservationUntil: number;
  dock: number;
}
export interface BikeUnlockResult {
  bikeId: string;
  requestId: string;
  ok: boolean;
  message: string;
  token?: string;
}

// Same route anchors, slot spacing and site search as the singleplayer station.
export function publiBikeStation(world: MovementWorld) {
  const anchor = world.name === "flat" ? [0, -20] : [-205.551, 49.449];
  const next = world.name === "flat" ? [18, -20] : [-187.722, 49.187];
  const length = Math.hypot(next[0] - anchor[0], next[1] - anchor[1]);
  const u = [(next[0] - anchor[0]) / length, (next[1] - anchor[1]) / length], n = [-u[1], u[0]];
  for (const along of [0, 8, -8, 16, -16, 24, -24]) for (const offset of [5, -5, 8, -8, 11, -11, 14, -14]) {
    const center = { x: anchor[0] + u[0] * along + n[0] * offset, z: anchor[1] + u[1] * along + n[1] * offset };
    const slots = Array.from({ length: PUBLI_BIKE_COUNT }, (_, i) => ({ x: center.x + u[0] * (i - 3.5) * 1.3, z: center.z + u[1] * (i - 3.5) * 1.3 }));
    const clear = slots.every(p => [-0.6, 0, 0.6].every(a => [-2, 0, 2].every(b => {
      const x = p.x + u[0] * a + n[0] * b, z = p.z + u[1] * a + n[1] * b, y = world.height(x, z), base = world.height(p.x, p.z);
      return y !== undefined && base !== undefined && Math.abs(y - base) <= 0.3 && !world.blocked(x, y, z, 0.35, CAPSULE_HEIGHT);
    })));
    if (clear) return { center, heading: Math.atan2(-n[0], -n[1]), slots: slots.map(p => ({ ...p, y: world.height(p.x, p.z)! })) };
  }
  throw new Error("No clear PubliBike station site near the prototype route.");
}
