import * as C from "./constants.ts";
import type { PlayerState } from "./types.ts";
export interface Contact {
  nx: number;
  ny: number;
  nz: number;
  dist: number;
}
export function createContact(): Contact {
  return {
    nx: 1,
    ny: 0,
    nz: 0,
    dist: 0,
  };
}
export function capsuleContact(
  a: Pick<PlayerState, "x" | "y" | "z">,
  b: Pick<PlayerState, "x" | "y" | "z">,
  out: Contact,
  margin = 0,
): boolean {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    raw = b.y - a.y;
  const diameter = 2 * C.CAPSULE_RADIUS + margin;
  if (Math.abs(dx) >= diameter || Math.abs(dz) >= diameter) return false;
  const dy =
    Math.sign(raw) *
    Math.max(0, Math.abs(raw) - (C.CAPSULE_HEIGHT - 2 * C.CAPSULE_RADIUS));
  const squared = dx * dx + dy * dy + dz * dz;
  if (squared >= diameter * diameter) return false;
  const d = Math.sqrt(squared);
  out.dist = d;
  out.nx = d > 1e-6 ? dx / d : 1;
  out.ny = d > 1e-6 ? dy / d : 0;
  out.nz = d > 1e-6 ? dz / d : 0;
  return true;
}
