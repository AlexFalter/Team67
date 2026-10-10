import * as C from "./constants.ts";
import type { Input, PlayerState, VehicleState } from "./types.ts";
import { resolveHouses } from "./flatObstacles.ts";
import { flatWorld, routePoint, type MovementWorld } from "./world.ts";
import { isRail, railSeatPosition } from "./transit.ts";

export function vehicleRadius(v: Pick<VehicleState, "kind">) { return v.kind === 2 ? 0.65 : v.kind === 1 ? 2.4 : isRail(v) ? 1.3 : C.CART_RADIUS; }
export function vehicleSpeed(v: Pick<VehicleState, "kind">) { return v.kind === 2 ? C.BIKE_SPEED : C.CART_SPEED; }

export function createVehicle(kind = 0, x = 0, z = 0): VehicleState {
  return {
    kind,
    derailStartedAt: 0, derailAge: 0,
    railDistance: 0, railLane: 0, railReverse: false, pitch: 0,
    x,
    y: 0,
    z,
    rotY: 0,
    vx: 0,
    vz: 0,
    capacity: kind === 1 ? C.SHUTTLE_CAPACITY : kind >= 3 ? 0 : 1,
    driver: "",
    departureAt: 0,
    traveling: false,
    fromX: x,
    fromZ: z,
    toX: x,
    toZ: z,
    tripStartedAt: 0,
    arrivalAt: 0,
    fallenUntil: 0,
  };
}

export function stepCart(v: VehicleState, input: Input, dt: number, world: MovementWorld = flatWorld) {
  const previous = { x: v.x, y: v.y, z: v.z };
  const speed = vehicleSpeed(v);
  const length = Math.hypot(input.x, input.z),
    moving = length > 0;
  const blend =
    1 - Math.exp(-(moving ? C.CART_ACCELERATION : C.CART_FRICTION) * dt);
  v.vx +=
    ((moving ? (input.x / Math.max(1, length)) * speed : 0) - v.vx) *
    blend;
  v.vz +=
    ((moving ? (input.z / Math.max(1, length)) * speed : 0) - v.vz) *
    blend;
  if (Math.hypot(v.vx, v.vz) > 0.2) v.rotY = Math.atan2(v.vx, v.vz);
  const radius = vehicleRadius(v), bounds = world.bounds;
  v.x += v.vx * dt;
  v.z += v.vz * dt;
  const vx = v.vx, vz = v.vz;
  if (v.x < bounds.minX + radius || v.x > bounds.maxX - radius) {
    v.x = Math.max(bounds.minX + radius, Math.min(bounds.maxX - radius, v.x));
    v.vx = 0;
  }
  if (v.z < bounds.minZ + radius || v.z > bounds.maxZ - radius) {
    v.z = Math.max(bounds.minZ + radius, Math.min(bounds.maxZ - radius, v.z));
    v.vz = 0;
  }
  const body = { ...v, vy: 0, grounded: true };
  if (world.name === "flat") resolveHouses(body, previous, radius);
  else {
    const canMove = (x: number, z: number) => {
      const y = world.height(x, z);
      return y !== undefined && Math.abs(y - v.y) <= C.MAX_GROUND_STEP &&
        !world.blocked(x, y, z, radius, C.CART_HIT_HEIGHT);
    };
    if (!canMove(body.x, previous.z)) { body.x = previous.x; body.vx = 0; }
    if (!canMove(body.x, body.z)) { body.z = previous.z; body.vz = 0; }
    v.y = world.height(body.x, body.z) ?? v.y;
  }
  v.x = body.x; v.z = body.z; v.vx = body.vx; v.vz = body.vz;
  return Math.hypot(vx - v.vx, vz - v.vz);
}

export function seatPosition(
  v: VehicleState,
  seat: number,
  out: { x: number; y: number; z: number },
) {
  if (isRail(v)) { railSeatPosition(v, seat, out); return; }
  const x = v.kind !== 1 ? 0 : seat % 2 === 0 ? -0.65 : 0.65;
  const z = v.kind !== 1 ? 0 : (Math.floor(seat / 2) - 1) * 1.25;
  out.x = v.x + x * Math.cos(v.rotY) + z * Math.sin(v.rotY);
  out.y = v.y + (v.kind !== 1 ? C.CART_SEAT_HEIGHT : C.SHUTTLE_SEAT_HEIGHT);
  out.z = v.z - x * Math.sin(v.rotY) + z * Math.cos(v.rotY);
}

// Analytic transport motion: no physics or player movement simulation.
export function shuttlePosition(v: VehicleState, now: number, world: MovementWorld = flatWorld) {
  const duration = v.arrivalAt - v.tripStartedAt;
  const f =
    duration > 0
      ? Math.max(0, Math.min(1, (now - v.tripStartedAt) / duration))
      : 1;
  if (world.name === "zurich") {
    const reverse = Math.hypot(v.fromX - world.stops[0].x, v.fromZ - world.stops[0].z) > 1;
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
  if (p.vehicleId || p.y - v.y > C.CART_HIT_HEIGHT || p.y + C.CAPSULE_HEIGHT < v.y)
    return false;
  if (Math.hypot(v.vx, v.vz) < C.CART_MIN_HIT_SPEED) return false;
  const dx = p.x - v.x,
    dz = p.z - v.z,
    r = vehicleRadius(v) + C.CAPSULE_RADIUS;
  const squared = dx * dx + dz * dz;
  if (squared >= r * r) return false;
  const dist = Math.sqrt(squared),
    speed = Math.hypot(v.vx, v.vz);
  out.nx = dist > 1e-6 ? dx / dist : v.vx / speed;
  out.nz = dist > 1e-6 ? dz / dist : v.vz / speed;
  out.closing = (v.vx - p.vx) * out.nx + (v.vz - p.vz) * out.nz;
  return out.closing > 0;
}
