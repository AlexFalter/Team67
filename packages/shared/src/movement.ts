import * as C from "./constants.ts";
import type { Body, Input, Impulse } from "./types.ts";
import { resolveHouses } from "./flatObstacles.ts";
import { flatWorld, type MovementWorld } from "./world.ts";
import { createVehicle, stepCart, seatPosition } from "./vehicles.ts";
import { MATE_SPEED_MULTIPLIER } from "./mate.ts";
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
    character: 0,
    vehicleId: "",
    seat: -1,
    grounded: true,
    groundTime: 0,
    jumpUntil: 0,
    knockdownUntil: 0,
    simTime: 0,
    vehicleKind: -1,
    shoes: false,
    attackReadyAt: 0,
    mateCount: 0,
    mateBoostMs: 0,
  };
}
export function respawn(p: Body, world: MovementWorld = flatWorld) {
  // Respawns must be deterministic during rollback/replay.
  Object.assign(p, world.spawn);
  p.y = world.height(p.x, p.z) ?? p.y;
  p.vx = p.vy = p.vz = 0;
  p.grounded = true;
  p.knockdownUntil = 0;
  p.groundTime = p.simTime; p.jumpUntil = 0;
  p.slideUntil = p.slideReadyAt = 0; p.sprintJump = false;
}
export function applyImpulse(p: Body, hit: Impulse, now: number) {
  p.vx += hit.ix;
  p.vy += hit.iy;
  p.vz += hit.iz;
  if (hit.iy > 0) p.grounded = false;
  p.groundTime = -1e9; p.jumpUntil = 0;
  p.slideUntil = 0; p.sprintJump = false;
  if (hit.knockdown) p.knockdownUntil = Math.max(p.knockdownUntil, now + (hit.durationMs ?? C.KNOCKDOWN_DURATION_MS));
}
export function stepMovement(p: Body, input: Input, dt: number, now: number, world: MovementWorld = flatWorld) {
  const previous = { x: p.x, y: p.y, z: p.z };
  const down = now < p.knockdownUntil,
    length = Math.hypot(input.x, input.z);
  if (down || !p.grounded) p.slideUntil = 0;
  if (input.slide && input.sprint && p.grounded && !down && !input.jump &&
    now >= (p.slideReadyAt ?? 0) && Math.hypot(p.vx, p.vz) >= C.SLIDE_MIN_SPEED) {
    p.slideUntil = now + C.SLIDE_DURATION_MS;
    p.slideReadyAt = now + C.SLIDE_DURATION_MS + C.SLIDE_COOLDOWN_MS;
  }
  const slideJump = input.jump && now < (p.slideUntil ?? 0);
  if (input.jump) p.slideUntil = 0;
  const sliding = now < (p.slideUntil ?? 0);
  const targetSpeed = (input.sprint ? C.SPRINT_SPEED : C.WALK_SPEED) * (p.shoes ? C.SHOE_SPEED_MULTIPLIER : 1) * (p.mateBoostMs > 0 ? MATE_SPEED_MULTIPLIER : 1);
  // Keep takeoff momentum; air steering cannot instantly brake or reverse it.
  const speed = !p.grounded && !down ? Math.max(targetSpeed, Math.hypot(p.vx, p.vz)) : targetSpeed;
  const moving = !down && length > 0;
  const rate = down ? 9 : p.grounded ? (moving ? C.ACCELERATION : C.FRICTION) : moving ? C.AIR_ACCELERATION : 0;
  const blend = 1 - Math.exp(-rate * dt);
  if (sliding || slideJump) {
    const drag = slideJump ? 1 : Math.exp(-C.SLIDE_FRICTION * dt);
    p.vx *= drag; p.vz *= drag;
  } else {
    p.vx +=
      ((moving ? (input.x / Math.max(1, length)) * speed : 0) - p.vx) * blend;
    p.vz +=
      ((moving ? (input.z / Math.max(1, length)) * speed : 0) - p.vz) * blend;
  }
  if (!down && input.aim && Number.isFinite(input.facing)) p.rotY = input.facing!;
  else if (moving) p.rotY = Math.atan2(input.x, input.z);
  if (p.grounded) p.groundTime = now;
  if (down) p.jumpUntil = 0;
  else if (input.jump) p.jumpUntil = now + C.JUMP_BUFFER_MS;
  if (!down && p.jumpUntil > now && (p.grounded || now - p.groundTime <= C.COYOTE_MS)) {
    p.sprintJump = input.sprint && Math.hypot(p.vx, p.vz) >= C.SLIDE_MIN_SPEED;
    p.vy = C.JUMP_VELOCITY * (p.shoes ? C.SHOE_JUMP_MULTIPLIER : 1);
    p.grounded = false;
    p.groundTime = -1e9; p.jumpUntil = 0;
  }
  const previousY = p.y;
  const oldGround = world.height(p.x, p.z), grounded = p.grounded;
  p.vy += C.GRAVITY * dt;
  const canMove = (x: number, z: number) => {
    const ground = world.height(x, z);
    return !world.blocked(x, p.y, z, C.CAPSULE_RADIUS, C.CAPSULE_HEIGHT) &&
      (!grounded || ground === undefined || oldGround === undefined || ground - oldGround <= C.MAX_GROUND_STEP);
  };
  const x = p.x + p.vx * dt, z = p.z + p.vz * dt;
  if (canMove(x, p.z)) p.x = x; else p.vx = 0;
  if (canMove(p.x, z)) p.z = z; else p.vz = 0;
  p.y += p.vy * dt;
  const ground = world.height(p.x, p.z);
  if (ground !== undefined && p.vy <= 0 &&
    ((previousY >= ground - 0.05 && p.y <= ground) ||
      (grounded && oldGround !== undefined && Math.abs(ground - oldGround) <= C.MAX_GROUND_STEP))) {
    p.y = ground;
    p.vy = 0;
    p.grounded = true;
  } else p.grounded = false;
  if (world.name === "flat") resolveHouses(p, previous);
  if (p.y < (ground ?? world.spawn.y) + C.RESPAWN_DEPTH) respawn(p, world);
  if (p.grounded || down) p.sprintJump = false;
  if (!p.grounded || Math.hypot(p.vx, p.vz) < 1) p.slideUntil = 0;
  p.anim = down ? 3 : now < (p.slideUntil ?? 0) ? C.SLIDE_ANIM : !p.grounded ? 2 : Math.hypot(p.vx, p.vz) > 0.2 ? 1 : 0;
}
export function stepPlayer(p: Body, input: Input, dt: number, world: MovementWorld = flatWorld) {
  p.simTime += dt * 1000;
  if (input.toggleShoes) p.shoes = !p.shoes;
  if (input.hit && !p.vehicleId && p.simTime >= p.knockdownUntil && p.simTime >= p.attackReadyAt)
    p.attackReadyAt = p.simTime + C.ATTACK_COOLDOWN_MS;
  if (p.vehicleId) {
    p.slideUntil = 0; p.sprintJump = false;
    let impact = 0;
    if (p.vehicleKind === 0 || p.vehicleKind === 2) {
      const v = createVehicle(p.vehicleKind, p.x, p.z);
      v.y = p.y - C.CART_SEAT_HEIGHT;
      v.vx = p.vx; v.vz = p.vz; v.rotY = p.rotY;
      impact = stepCart(v, input, dt, world);
      seatPosition(v, p.seat, p);
      p.vx = v.vx; p.vz = v.vz; p.vy = 0; p.rotY = v.rotY;
    }
    p.anim = 0; p.grounded = false;
    return impact;
  }
  stepMovement(p, input, dt, p.simTime, world);
}

export function packMove(p: Body): import("./types.ts").Move {
  return [p.x, p.y, p.z, p.rotY, p.vx, p.vy, p.vz, p.anim];
}
