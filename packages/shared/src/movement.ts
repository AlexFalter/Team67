import * as C from "./constants.ts";
import type { World } from "./world.ts";

/** Everything the movement step reads and writes. Plain numbers so it copies and serializes cheaply. */
export interface Body {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number;
  grounded: boolean;
  airTime: number; // seconds since last on the ground
  jumpBuffer: number; // seconds a jump press stays queued
  jumpHeld: boolean;
  down: number; // knockdown seconds remaining
  shoes: boolean;
  landed: boolean; // touched down during the last step (camera/animation cue)
}

/** One tick of input. forward/right in [-1, 1], relative to yaw. */
export interface Input {
  forward: number;
  right: number;
  yaw: number;
  jump: boolean;
  sprint: boolean;
}

export const ANIM_IDLE = 0, ANIM_RUN = 1, ANIM_AIR = 2, ANIM_DOWN = 3;

export function createBody(x = 0, y = 0, z = 0): Body {
  return { x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0, grounded: true, airTime: 0, jumpBuffer: 0, jumpHeld: false, down: 0, shoes: false, landed: false };
}

export function createInput(): Input {
  return { forward: 0, right: 0, yaw: 0, jump: false, sprint: false };
}

export function copyBody(from: Body, to: Body) {
  to.x = from.x; to.y = from.y; to.z = from.z;
  to.vx = from.vx; to.vy = from.vy; to.vz = from.vz;
  to.yaw = from.yaw; to.grounded = from.grounded; to.airTime = from.airTime;
  to.jumpBuffer = from.jumpBuffer; to.jumpHeld = from.jumpHeld; to.down = from.down;
  to.shoes = from.shoes; to.landed = from.landed;
  return to;
}

export function animOf(b: Body) {
  return b.down > 0 ? ANIM_DOWN : !b.grounded ? ANIM_AIR : b.vx * b.vx + b.vz * b.vz > 0.04 ? ANIM_RUN : ANIM_IDLE;
}

/** Can a capsule with feet at y occupy (x, z)? Ground must exist and be at most a step above the feet. */
export function free(world: World, x: number, y: number, z: number) {
  const g = world.height(x, z);
  return !Number.isNaN(g) && g <= y + C.STEP_HEIGHT && !world.blocked(x, Math.max(y, g), z, C.RADIUS, C.HEIGHT);
}

/**
 * The movement step: pure, allocation-free, deterministic. Same code on client, server checks and bots.
 * Order matters for feel: jump before friction (bunny hops keep speed), friction only on the ground,
 * capped air acceleration (air strafing), then axis-separated collision so walls slide.
 */
export function step(b: Body, input: Input, dt: number, world: World) {
  const down = b.down > 0;
  if (down) b.down = Math.max(0, b.down - dt);
  b.landed = false;
  b.yaw = input.yaw;

  // Wish direction in the world, from camera-relative keys.
  let wx = 0, wz = 0, wish = 0;
  if (!down) {
    const sin = Math.sin(input.yaw), cos = Math.cos(input.yaw);
    wx = -sin * input.forward + cos * input.right;
    wz = -cos * input.forward - sin * input.right;
    const len = Math.hypot(wx, wz);
    if (len > 1e-6) {
      wx /= len; wz /= len;
      wish = (input.sprint ? C.SPRINT_SPEED : C.WALK_SPEED) * (b.shoes ? C.SHOE_SPEED : 1) * Math.min(1, len);
    }
  }

  // Jump: buffered presses, coyote time, holding re-jumps on landing.
  const pressed = input.jump && !b.jumpHeld;
  b.jumpHeld = input.jump;
  b.jumpBuffer = pressed && !down ? C.JUMP_BUFFER : Math.max(0, b.jumpBuffer - dt);
  if (!down && (input.jump || b.jumpBuffer > 0) && (b.grounded || b.airTime < C.COYOTE_TIME)) {
    b.vy = C.JUMP_SPEED * (b.shoes ? C.SHOE_JUMP : 1);
    b.grounded = false;
    b.airTime = C.COYOTE_TIME;
    b.jumpBuffer = 0;
  }

  if (b.grounded) {
    const speed = Math.hypot(b.vx, b.vz);
    if (speed > 0) {
      const drop = Math.max(speed, C.STOP_SPEED) * (down ? C.DOWN_FRICTION : C.FRICTION) * dt;
      const k = Math.max(0, speed - drop) / speed;
      b.vx *= k; b.vz *= k;
    }
    accelerate(b, wx, wz, wish, wish, C.GROUND_ACCEL, dt);
  } else {
    accelerate(b, wx, wz, Math.min(wish, C.AIR_WISH_CAP), wish, C.AIR_ACCEL, dt);
    b.vy += C.GRAVITY * dt;
  }
  const h = Math.hypot(b.vx, b.vz);
  if (h > C.MAX_SPEED) { b.vx *= C.MAX_SPEED / h; b.vz *= C.MAX_SPEED / h; }

  const nx = b.x + b.vx * dt;
  if (free(world, nx, b.y, b.z)) b.x = nx; else b.vx = 0;
  const nz = b.z + b.vz * dt;
  if (free(world, b.x, b.y, nz)) b.z = nz; else b.vz = 0;

  const g = world.height(b.x, b.z);
  if (b.grounded) {
    // Follow slopes and steps down; a bigger drop means we walked off a ledge.
    if (b.y - g <= C.STEP_HEIGHT) { b.y = g; b.vy = 0; } else b.grounded = false;
  }
  if (!b.grounded) {
    b.y += b.vy * dt;
    if (b.y <= g) {
      b.y = g;
      if (b.vy <= 0) { b.vy = 0; b.grounded = true; b.landed = true; }
    }
  }
  b.airTime = b.grounded ? 0 : b.airTime + dt;
}

/** Quake accelerate: add speed along the wish direction until its projection reaches cap. */
function accelerate(b: Body, wx: number, wz: number, cap: number, wish: number, accel: number, dt: number) {
  if (wish <= 0) return;
  const add = cap - (b.vx * wx + b.vz * wz);
  if (add <= 0) return;
  const amount = Math.min(add, accel * wish * dt);
  b.vx += wx * amount; b.vz += wz * amount;
}

/** Push a body out of another player's capsule or a vehicle's circle (horizontal only). Contact only separates. */
export function separate(b: Body, ox: number, oy: number, oz: number, world: World, min = 2 * C.RADIUS) {
  if (Math.abs(b.y - oy) >= C.HEIGHT) return false;
  const dx = b.x - ox, dz = b.z - oz, d2 = dx * dx + dz * dz;
  if (d2 >= min * min) return false;
  const d = Math.sqrt(d2), push = min - d;
  const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
  const x = b.x + nx * push, z = b.z + nz * push;
  if (free(world, x, b.y, b.z)) b.x = x;
  if (free(world, b.x, b.y, z)) b.z = z;
  return true;
}

/** Knockback and knockdown from the server. */
export function knock(b: Body, ix: number, iy: number, iz: number, downMs: number) {
  b.vx += ix; b.vy = Math.max(b.vy, iy); b.vz += iz;
  if (iy > 0) { b.grounded = false; b.airTime = C.COYOTE_TIME; }
  b.down = Math.max(b.down, downMs / 1000);
  b.jumpBuffer = 0;
}
