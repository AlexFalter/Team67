import * as C from "./constants.ts";
import { routePoint, type Point, type Pose, type World } from "./world.ts";
import type { Input } from "./movement.ts";

export interface VehicleBody extends Pose { kind: number; vx: number; vz: number }

export function vehicleRadius(kind: number) {
  return kind === C.BIKE ? C.BIKE_RADIUS : kind === C.SHUTTLE || kind === C.TRAFFIC ? C.SHUTTLE_RADIUS : C.CART_RADIUS;
}
export function seatCount(kind: number) {
  return kind === C.SHUTTLE ? C.SHUTTLE_SEATS : kind === C.TRAFFIC ? 0 : 1;
}

function vehicleFree(world: World, kind: number, x: number, y: number, z: number) {
  const g = world.height(x, z);
  return !Number.isNaN(g) && Math.abs(g - y) <= C.STEP_HEIGHT && !world.blocked(x, g, z, vehicleRadius(kind), C.VEHICLE_HIT_HEIGHT);
}

/**
 * Driver-owned cart/bike step (pure, allocation-free). Velocity eases toward the camera-relative wish
 * direction and the body turns to face its motion. Returns the speed lost to walls (bike crash cue).
 */
export function stepVehicle(v: VehicleBody, input: Input, dt: number, world: World) {
  const sin = Math.sin(input.yaw), cos = Math.cos(input.yaw);
  let wx = -sin * input.forward + cos * input.right, wz = -cos * input.forward - sin * input.right;
  const len = Math.hypot(wx, wz), top = v.kind === C.BIKE ? C.BIKE_SPEED : C.CART_SPEED;
  if (len > 1e-6) { wx = (wx / len) * top; wz = (wz / len) * top; }
  const k = 1 - Math.exp(-(len > 1e-6 ? C.CART_ACCEL : C.CART_FRICTION) * dt);
  v.vx += (wx - v.vx) * k;
  v.vz += (wz - v.vz) * k;
  const speed = Math.hypot(v.vx, v.vz);
  if (speed > 0.5) v.yaw = Math.atan2(-v.vx, -v.vz);
  let impact = 0;
  const nx = v.x + v.vx * dt;
  if (vehicleFree(world, v.kind, nx, v.y, v.z)) v.x = nx; else { impact += Math.abs(v.vx); v.vx = 0; }
  const nz = v.z + v.vz * dt;
  if (vehicleFree(world, v.kind, v.x, v.y, nz)) v.z = nz; else { impact += Math.abs(v.vz); v.vz = 0; }
  const g = world.height(v.x, v.z);
  if (!Number.isNaN(g)) v.y = g;
  return impact;
}

/** World position of a seat (feet of the rider). */
export function seatPosition(v: Pose & { kind: number }, seat: number, out: Point) {
  const side = v.kind === C.SHUTTLE ? (seat % 2 ? 0.65 : -0.65) : 0;
  const along = v.kind === C.SHUTTLE ? ((seat >> 1) - 1) * 1.25 : 0;
  const sin = Math.sin(v.yaw), cos = Math.cos(v.yaw);
  out.x = v.x + side * cos - along * sin;
  out.z = v.z - side * sin - along * cos;
  out.y = v.y + (v.kind === C.SHUTTLE ? C.SHUTTLE_SEAT_HEIGHT : C.CART_SEAT_HEIGHT);
}

/** Where a rider lands when getting off: beside the vehicle. */
export function exitPoint(v: Pose & { kind: number }, seat: number, out: Point) {
  const side = seat % 2 ? 1 : -1, offset = v.kind === C.SHUTTLE ? 3 : 2;
  const along = v.kind === C.SHUTTLE ? ((seat >> 1) - 1) * 1.25 : 0;
  const sin = Math.sin(v.yaw), cos = Math.cos(v.yaw);
  out.x = v.x + side * offset * cos - along * sin;
  out.z = v.z - side * offset * sin - along * cos;
  out.y = v.y;
}

export function shuttleTripMs(world: World) {
  return (world.routeLength / C.SHUTTLE_SPEED) * 1000;
}

/**
 * The shuttle is a pure function of the server schedule, so every client computes it exactly from the
 * synced clock: no interpolation needed. dir 0 = HB → ETH, 1 = back. tripStart 0 = waiting at its stop.
 */
export function shuttlePose(world: World, dir: number, tripStart: number, now: number, out: VehicleBody) {
  const moving = tripStart > 0 && now >= tripStart;
  const d = moving ? Math.min(world.routeLength, ((now - tripStart) / 1000) * C.SHUTTLE_SPEED) : 0;
  routePoint(world, d, dir === 1, out);
  const speed = moving && d < world.routeLength ? C.SHUTTLE_SPEED : 0;
  out.vx = -Math.sin(out.yaw) * speed;
  out.vz = -Math.cos(out.yaw) * speed;
}

/** Background traffic loops the route back and forth from the room's start time. */
export function trafficPose(world: World, start: number, now: number, out: VehicleBody) {
  const phase = ((((now - start) / 1000) * C.TRAFFIC_SPEED) % (2 * world.routeLength) + 2 * world.routeLength) % (2 * world.routeLength);
  const back = phase >= world.routeLength;
  routePoint(world, back ? phase - world.routeLength : phase, back, out);
  out.vx = -Math.sin(out.yaw) * C.TRAFFIC_SPEED;
  out.vz = -Math.cos(out.yaw) * C.TRAFFIC_SPEED;
}

/** Is a foot player at p inside a moving vehicle's footprint? */
export function vehicleTouches(v: VehicleBody, p: Point) {
  if (p.y - v.y > C.VEHICLE_HIT_HEIGHT || p.y + C.HEIGHT < v.y) return false;
  const r = vehicleRadius(v.kind) + C.RADIUS, dx = p.x - v.x, dz = p.z - v.z;
  return dx * dx + dz * dz < r * r;
}
