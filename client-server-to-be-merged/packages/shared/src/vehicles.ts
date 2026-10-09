import * as C from "./constants.ts";
import type { Input, PlayerState, VehicleState } from "./types.ts";

export function createVehicle(kind = 0, x = 0, z = 0): VehicleState {
  return {
    kind,
    x,
    y: 0,
    z,
    rotY: 0,
    vx: 0,
    vz: 0,
    capacity: kind === 0 ? 1 : C.SHUTTLE_CAPACITY,
    driver: "",
    departureAt: 0,
    traveling: false,
    fromX: x,
    fromZ: z,
    toX: x,
    toZ: z,
    tripStartedAt: 0,
    arrivalAt: 0,
  };
}

export function stepCart(v: VehicleState, input: Input, dt: number) {
  const length = Math.hypot(input.x, input.z),
    moving = length > 0;
  const blend =
    1 - Math.exp(-(moving ? C.CART_ACCELERATION : C.CART_FRICTION) * dt);
  v.vx +=
    ((moving ? (input.x / Math.max(1, length)) * C.CART_SPEED : 0) - v.vx) *
    blend;
  v.vz +=
    ((moving ? (input.z / Math.max(1, length)) * C.CART_SPEED : 0) - v.vz) *
    blend;
  if (Math.hypot(v.vx, v.vz) > 0.2) v.rotY = Math.atan2(v.vx, v.vz);
  const bound = C.PLANE_SIZE / 2 - C.CART_RADIUS;
  v.x += v.vx * dt;
  v.z += v.vz * dt;
  if (Math.abs(v.x) > bound) {
    v.x = Math.max(-bound, Math.min(bound, v.x));
    v.vx = 0;
  }
  if (Math.abs(v.z) > bound) {
    v.z = Math.max(-bound, Math.min(bound, v.z));
    v.vz = 0;
  }
}

export function seatPosition(
  v: VehicleState,
  seat: number,
  out: { x: number; y: number; z: number },
) {
  const x = v.kind === 0 ? 0 : seat % 2 === 0 ? -0.65 : 0.65;
  const z = v.kind === 0 ? 0 : (Math.floor(seat / 2) - 1) * 1.25;
  out.x = v.x + x * Math.cos(v.rotY) + z * Math.sin(v.rotY);
  out.y = v.y + (v.kind === 0 ? C.CART_SEAT_HEIGHT : C.SHUTTLE_SEAT_HEIGHT);
  out.z = v.z - x * Math.sin(v.rotY) + z * Math.cos(v.rotY);
}

// Analytic transport motion: no physics or player movement simulation.
export function shuttlePosition(v: VehicleState, now: number) {
  const duration = v.arrivalAt - v.tripStartedAt;
  const f =
    duration > 0
      ? Math.max(0, Math.min(1, (now - v.tripStartedAt) / duration))
      : 1;
  v.x = v.fromX + (v.toX - v.fromX) * f;
  v.z = v.fromZ + (v.toZ - v.fromZ) * f;
  v.rotY = Math.atan2(v.toX - v.fromX, v.toZ - v.fromZ);
  v.vx = f < 1 ? (v.toX - v.fromX) / (duration / 1000) : 0;
  v.vz = f < 1 ? (v.toZ - v.fromZ) / (duration / 1000) : 0;
}

export interface VehicleContact {
  nx: number;
  nz: number;
  closing: number;
}
export function cartContact(
  v: VehicleState,
  p: PlayerState,
  out: VehicleContact,
) {
  if (p.vehicleId || p.y > C.CART_HIT_HEIGHT || p.y + C.CAPSULE_HEIGHT < 0)
    return false;
  if (Math.hypot(v.vx, v.vz) < C.CART_MIN_HIT_SPEED) return false;
  const dx = p.x - v.x,
    dz = p.z - v.z,
    r = C.CART_RADIUS + C.CAPSULE_RADIUS;
  const squared = dx * dx + dz * dz;
  if (squared >= r * r) return false;
  const dist = Math.sqrt(squared),
    speed = Math.hypot(v.vx, v.vz);
  out.nx = dist > 1e-6 ? dx / dist : v.vx / speed;
  out.nz = dist > 1e-6 ? dz / dist : v.vz / speed;
  out.closing = (v.vx - p.vx) * out.nx + (v.vz - p.vz) * out.nz;
  return out.closing > 0;
}
