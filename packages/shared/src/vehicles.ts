import * as C from "./constants.ts";
import type { Input, PlayerState, VehicleState } from "./types.ts";
import { flatWorld, routePoint, type MovementWorld } from "./world.ts";

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

export function stepCart(
  v: VehicleState,
  input: Input,
  dt: number,
  world: MovementWorld = flatWorld,
) {
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
  const bounds = world.bounds,
    x = Math.max(
      bounds.minX + C.CART_RADIUS,
      Math.min(bounds.maxX - C.CART_RADIUS, v.x + v.vx * dt),
    ),
    z = Math.max(
      bounds.minZ + C.CART_RADIUS,
      Math.min(bounds.maxZ - C.CART_RADIUS, v.z + v.vz * dt),
    );
  const canMove = (nx: number, nz: number) => {
    const y = world.height(nx, nz);
    return (
      y !== undefined &&
      !world.blocked(nx, y, nz, C.CART_RADIUS, C.CART_HIT_HEIGHT) &&
      Math.abs(y - v.y) <= C.MAX_GROUND_STEP
    );
  };
  if (canMove(x, v.z)) v.x = x;
  else v.vx = 0;
  if (canMove(v.x, z)) v.z = z;
  else v.vz = 0;
  if (
    v.x === bounds.minX + C.CART_RADIUS ||
    v.x === bounds.maxX - C.CART_RADIUS
  )
    v.vx = 0;
  if (
    v.z === bounds.minZ + C.CART_RADIUS ||
    v.z === bounds.maxZ - C.CART_RADIUS
  )
    v.vz = 0;
  v.y = world.height(v.x, v.z) ?? v.y;
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
export function shuttlePosition(
  v: VehicleState,
  now: number,
  world: MovementWorld = flatWorld,
) {
  const duration = v.arrivalAt - v.tripStartedAt;
  const f =
    duration > 0
      ? Math.max(0, Math.min(1, (now - v.tripStartedAt) / duration))
      : 1;
  if (world.name === "zurich") {
    const reverse =
      Math.hypot(v.fromX - world.stops[0].x, v.fromZ - world.stops[0].z) > 1;
    routePoint(world, f * world.routeLength, v, reverse);
    v.vx = f < 1 ? Math.sin(v.rotY) * C.SHUTTLE_SPEED : 0;
    v.vz = f < 1 ? Math.cos(v.rotY) * C.SHUTTLE_SPEED : 0;
    return;
  }
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
  if (
    p.vehicleId ||
    p.y - v.y > C.CART_HIT_HEIGHT ||
    p.y + C.CAPSULE_HEIGHT < v.y
  )
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
