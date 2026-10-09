import * as C from "./constants.ts";
import type { Body, Input, Impulse, Move } from "./types.ts";
export function createBody(): Body {
  return {
    x: 0,
    y: 0,
    z: 0,
    rotY: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    anim: 0,
    color: "#ffffff",
    vehicleId: "",
    seat: -1,
    grounded: true,
    knockdownUntil: 0,
  };
}
export function respawn(p: Body) {
  p.x = (Math.random() - 0.5) * C.SPAWN_SPREAD;
  p.z = (Math.random() - 0.5) * C.SPAWN_SPREAD;
  p.y = 0;
  p.vx = p.vy = p.vz = 0;
  p.grounded = true;
  p.knockdownUntil = 0;
}
export function applyImpulse(p: Body, hit: Impulse, now: number) {
  p.vx += hit.ix;
  p.vy += hit.iy;
  p.vz += hit.iz;
  if (hit.iy > 0) p.grounded = false;
  if (hit.knockdown) p.knockdownUntil = now + C.KNOCKDOWN_DURATION_MS;
}
export function stepMovement(p: Body, input: Input, dt: number, now: number) {
  const down = now < p.knockdownUntil,
    length = Math.hypot(input.x, input.z);
  const speed = input.sprint ? C.SPRINT_SPEED : C.WALK_SPEED;
  const moving = !down && length > 0;
  const blend = 1 - Math.exp(-(moving ? C.ACCELERATION : C.FRICTION) * dt);
  p.vx +=
    ((moving ? (input.x / Math.max(1, length)) * speed : 0) - p.vx) * blend;
  p.vz +=
    ((moving ? (input.z / Math.max(1, length)) * speed : 0) - p.vz) * blend;
  if (moving) p.rotY = Math.atan2(input.x, input.z);
  if (!down && input.jump && p.grounded) {
    p.vy = C.JUMP_VELOCITY;
    p.grounded = false;
  }
  const previousY = p.y;
  p.vy += C.GRAVITY * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;
  const onPlane =
    Math.abs(p.x) <= C.PLANE_SIZE / 2 && Math.abs(p.z) <= C.PLANE_SIZE / 2;
  if (onPlane && previousY >= 0 && p.y <= 0 && p.vy <= 0) {
    p.y = 0;
    p.vy = 0;
    p.grounded = true;
  } else p.grounded = false;
  if (p.y < C.RESPAWN_DEPTH) respawn(p);
  p.anim = down ? 3 : !p.grounded ? 2 : Math.hypot(p.vx, p.vz) > 0.2 ? 1 : 0;
}
export function packMove(p: Body): Move {
  return [p.x, p.y, p.z, p.rotY, p.vx, p.vy, p.vz, p.anim];
}
