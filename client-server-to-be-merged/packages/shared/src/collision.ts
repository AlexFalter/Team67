import * as C from "./constants.ts";
import type { PlayerState } from "./types.ts";
export interface Contact {
  nx: number;
  ny: number;
  nz: number;
  dist: number;
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  knockA: boolean;
  knockB: boolean;
}
export function createContact(): Contact {
  return {
    nx: 1,
    ny: 0,
    nz: 0,
    dist: 0,
    ax: 0,
    ay: 0,
    az: 0,
    bx: 0,
    by: 0,
    bz: 0,
    knockA: false,
    knockB: false,
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
export function collisionImpulses(
  a: PlayerState,
  b: PlayerState,
  o: Contact,
): boolean {
  if (!capsuleContact(a, b, o, C.SERVER_RADIUS_MARGIN)) return false;
  const closing =
    (a.vx - b.vx) * o.nx + (a.vy - b.vy) * o.ny + (a.vz - b.vz) * o.nz;
  if (closing <= 0) return false;
  const sa = Math.hypot(a.vx, a.vy, a.vz),
    sb = Math.hypot(b.vx, b.vy, b.vz),
    share = sa / (sa + sb + 0.001);
  const fa = -closing * (1 - share) * C.HIT_STRENGTH,
    fb = closing * share * C.HIT_STRENGTH;
  o.ax = o.nx * fa;
  o.ay = o.ny * fa;
  o.az = o.nz * fa;
  o.bx = o.nx * fb;
  o.by = o.ny * fb;
  o.bz = o.nz * fb;
  o.knockA = closing > C.KNOCKDOWN_SPEED && 1 - share > 0.7;
  o.knockB = closing > C.KNOCKDOWN_SPEED && share > 0.7;
  if (o.ny < -0.7 && a.vy < 0) {
    o.ax = o.az = 0;
    o.ay = C.STOMP_BOUNCE;
    o.knockA = false;
    o.knockB = true;
  }
  if (o.ny > 0.7 && b.vy < 0) {
    o.bx = o.bz = 0;
    o.by = C.STOMP_BOUNCE;
    o.knockB = false;
    o.knockA = true;
  }
  return true;
}
