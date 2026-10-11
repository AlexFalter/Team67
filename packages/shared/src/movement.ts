import * as C from "./constants.ts";
import type { Body, Input, Impulse } from "./types.ts";
import { resolveHouses } from "./flatObstacles.ts";
import { flatWorld, type MovementWorld } from "./world.ts";
import { createVehicle, stepCart, seatPosition } from "./vehicles.ts";
import { MATE_SPEED_MULTIPLIER } from "./mate.ts";
import { raceSpawnPoint } from "./battleBus.ts";
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
    cabinStanding: false, cabinX: 0, cabinZ: 0, cabinYaw: 0,
    grounded: true,
    groundTime: 0,
    jumpUntil: 0,
    knockdownUntil: 0,
    impactStartedAt: 0, impactX: 0, impactZ: 0, impactStrength: 0,
    simTime: 0,
    vehicleKind: -1,
    attackReadyAt: 0,
    limeBoostMs: C.LIME_BOOST_DURATION_MS, limeBoostExhausted: false,
    mateCount: 0,
    mateBoostMs: 0, mateFlavor: 2, mateDrinkStartedAt: 0,
  };
}
export function respawn(p: Body, world: MovementWorld = flatWorld) {
  // Respawns must be deterministic during rollback/replay.
  Object.assign(p, raceSpawnPoint(world));
  p.y = world.height(p.x, p.z) ?? p.y;
  p.vx = p.vy = p.vz = 0;
  p.grounded = true;
  p.knockdownUntil = 0; p.invincibleUntil = 0;
  p.impactStartedAt = p.impactX = p.impactZ = p.impactStrength = 0;
  p.groundTime = p.simTime; p.jumpUntil = 0; p.jumpReadyAt = 0;
  p.jumpFatigue = 0; p.jumpSprintLocked = false;
  p.slideUntil = p.slideReadyAt = p.slideBufferedUntil = 0; p.sprintJump = false;
}
export function applyImpulse(p: Body, hit: Impulse, now: number) {
  if ((hit.at ?? now) < (p.invincibleUntil ?? 0)) return;
  p.vx += hit.ix;
  p.vy += hit.iy;
  p.vz += hit.iz;
  if (hit.iy > 0) p.grounded = false;
  p.groundTime = -1e9; p.jumpUntil = 0;
  p.slideUntil = 0; p.slideBufferedUntil = 0; p.sprintJump = false;
  if (hit.knockdown) {
    const at = hit.at ?? now;
    p.impactStartedAt = at; p.impactX = hit.ix; p.impactZ = hit.iz;
    p.impactStrength = Math.hypot(hit.ix, hit.iy, hit.iz);
    p.knockdownUntil = Math.max(p.knockdownUntil, at + (hit.durationMs ?? C.KNOCKDOWN_DURATION_MS));
    p.invincibleUntil = p.knockdownUntil + (hit.recoveryProtectionMs ?? 1000);
    p.anim = 3;
  }
}
// Velocity is integrated from acceleration, not replaced by an input target.
// Ground grip removes lateral slip; airborne control adds bounded directional
// acceleration while retaining launch momentum and collision impulses.
function accelerateFoot(p: Body, input: Input, targetSpeed: number, dt: number, takingOff: boolean, boost: number) {
  const oldSpeed = Math.hypot(p.vx, p.vz), length = Math.hypot(input.x, input.z);
  if (length === 0) {
    if (p.grounded && !takingOff && oldSpeed > 0) {
      // Exact constant-braking + drag solution; finite stop without a tiny tail.
      const offset = C.BRAKING_DECELERATION / C.FRICTION;
      const speed = Math.max(0, (oldSpeed + offset) * Math.exp(-C.FRICTION * dt) - offset);
      p.vx *= speed / oldSpeed; p.vz *= speed / oldSpeed;
    }
    return;
  }
  const x = input.x / length, z = input.z / length;
  const wishSpeed = targetSpeed * Math.min(1, length);
  const along = p.vx * x + p.vz * z;
  if (p.grounded && !takingOff) {
    const lateralX = p.vx - along * x, lateralZ = p.vz - along * z;
    const grip = Math.exp(-C.GROUND_GRIP * dt);
    const rate = along < 0 ? C.REVERSAL_ACCELERATION * boost : along > wishSpeed ? C.OVERSPEED_DECELERATION : C.ACCELERATION * boost;
    const change = Math.max(-rate * dt, Math.min(rate * dt, wishSpeed - along));
    p.vx = x * (along + change) + lateralX * grip;
    p.vz = z * (along + change) + lateralZ * grip;
  } else {
    // Do not brake the existing velocity when airborne input is released or
    // points elsewhere; only add the acceleration needed along the new input.
    const push = Math.max(0, Math.min(wishSpeed - along, C.AIR_ACCELERATION * boost * dt));
    p.vx += x * push; p.vz += z * push;
  }
  // Turning/air strafing cannot manufacture extra speed. External overspeed
  // persists in the air and settles gradually on the ground instead of snapping.
  const limit = Math.max(wishSpeed, p.grounded && !takingOff ? oldSpeed - C.OVERSPEED_DECELERATION * dt : oldSpeed);
  const speed = Math.hypot(p.vx, p.vz);
  if (speed > limit && speed > 0) { p.vx *= limit / speed; p.vz *= limit / speed; }
}

export function stepMovement(p: Body, input: Input, dt: number, now: number, world: MovementWorld = flatWorld) {
  const previous = { x: p.x, y: p.y, z: p.z };
  const down = now < p.knockdownUntil,
    length = Math.hypot(input.x, input.z);
  const wantsJump = (input.jump || p.jumpUntil > now) && now >= (p.jumpReadyAt ?? 0);
  // Half a second of grounded walking/rest restores fatigue. Immediate repeat
  // takeoffs do not count as rest, even when the jump was buffered in the air.
  if (p.grounded && !wantsJump && p.jumpFatigue) {
    p.jumpFatigue = Math.max(0, p.jumpFatigue - dt * 1000 / C.JUMP_FATIGUE_RECOVERY_MS);
    if (p.jumpFatigue < 1e-8) { p.jumpFatigue = 0; p.jumpSprintLocked = false; }
  }
  const fatigue = p.jumpFatigue ?? 0;
  if (fatigue >= C.JUMP_FATIGUE_WALK_THRESHOLD) p.jumpSprintLocked = true;
  const sprinting = input.sprint && !p.jumpSprintLocked;
  if (down || !p.grounded) p.slideUntil = 0;
  if (input.slide && sprinting && !down && !input.jump) p.slideBufferedUntil = now + C.SLIDE_BUFFER_MS;
  if (down || !sprinting || input.jump || (p.slideBufferedUntil ?? 0) <= now) p.slideBufferedUntil = 0;
  const startSlide = () => {
    if ((p.slideBufferedUntil ?? 0) <= now || !p.grounded) return;
    if (now >= (p.slideReadyAt ?? 0) && Math.hypot(p.vx, p.vz) >= C.SLIDE_MIN_SPEED) {
      p.slideUntil = now + C.SLIDE_DURATION_MS;
      p.slideReadyAt = now + C.SLIDE_DURATION_MS + C.SLIDE_COOLDOWN_MS;
    }
    p.slideBufferedUntil = 0;
  };
  startSlide();
  const slideJump = input.jump && now < (p.slideUntil ?? 0);
  if (input.jump) p.slideUntil = 0;
  const sliding = now < (p.slideUntil ?? 0);
  const boost = p.mateBoostMs > 0 ? MATE_SPEED_MULTIPLIER : 1;
  const sprintSpeed = C.SPRINT_SPEED - (C.SPRINT_SPEED - C.WALK_SPEED) * Math.min(1, fatigue / C.JUMP_FATIGUE_WALK_THRESHOLD);
  const targetSpeed = (sprinting ? sprintSpeed : C.WALK_SPEED) * boost;
  const moving = !down && length > 0;
  if (sliding || slideJump) {
    const drag = slideJump ? 1 : Math.exp(-C.SLIDE_FRICTION * dt);
    p.vx *= drag; p.vz *= drag;
  } else if (down) {
    const drag = Math.exp(-(p.grounded ? 6 : 0.8) * dt);
    p.vx *= drag; p.vz *= drag;
  } else {
    const takingOff = now >= (p.jumpReadyAt ?? 0) && (input.jump || p.jumpUntil > now) && (p.grounded || now - p.groundTime <= C.COYOTE_MS);
    accelerateFoot(p, input, targetSpeed, dt, takingOff, boost);
  }
  if (!down && input.aim && Number.isFinite(input.facing)) p.rotY = input.facing!;
  else if (moving) p.rotY = Math.atan2(input.x, input.z);
  if (p.grounded) p.groundTime = now;
  if (down) p.jumpUntil = 0;
  else if (input.jump) p.jumpUntil = now + C.JUMP_BUFFER_MS;
  if (!down && now >= (p.jumpReadyAt ?? 0) && p.jumpUntil > now && (p.grounded || now - p.groundTime <= C.COYOTE_MS)) {
    // A tired takeoff sheds excess sprint momentum, including slide exits.
    const speed = Math.hypot(p.vx, p.vz);
    if (fatigue > 0 && speed > targetSpeed) { p.vx *= targetSpeed / speed; p.vz *= targetSpeed / speed; }
    p.sprintJump = sprinting && Math.hypot(p.vx, p.vz) >= C.SLIDE_MIN_SPEED;
    p.vy = C.JUMP_VELOCITY * (1 - (1 - C.JUMP_FATIGUE_MIN_POWER) * (p.jumpFatigue ?? 0));
    p.jumpFatigue = Math.min(1, (p.jumpFatigue ?? 0) + C.JUMP_FATIGUE_PER_JUMP);
    p.jumpReadyAt = now + C.JUMP_COOLDOWN_MS;
    p.grounded = false;
    p.groundTime = -1e9; p.jumpUntil = 0;
  }
  const previousY = p.y;
  const oldGround = world.height(p.x, p.z, previousY), grounded = p.grounded;
  p.vy += C.GRAVITY * dt;
  const canMove = (x: number, z: number) => {
    const ground = world.height(x, z, previousY);
    if (world.blocked(x, p.y, z, C.CAPSULE_RADIUS, C.CAPSULE_HEIGHT)) return false;
    if (ground === undefined) return true;
    // grounded: at most one step up; airborne: never into terrain above the feet (+ one step), else a
    // jump against a slope moves the body inside the ground and it falls through the map
    return grounded ? oldGround === undefined || ground - oldGround <= C.MAX_GROUND_STEP : ground - p.y <= C.MAX_GROUND_STEP;
  };
  const x = p.x + p.vx * dt, z = p.z + p.vz * dt;
  if (canMove(x, p.z)) p.x = x; else p.vx = 0;
  if (canMove(p.x, z)) p.z = z; else p.vz = 0;
  p.y += p.vy * dt;
  const ground = world.height(p.x, p.z, previousY);
  if (ground !== undefined && p.vy <= 0 &&
    // land when crossing the ground from above, or when (up to one step) below it after a move onto a
    // ledge, instead of continuing to fall inside the terrain
    ((previousY >= ground - C.MAX_GROUND_STEP && p.y <= ground) ||
      (grounded && oldGround !== undefined && Math.abs(ground - oldGround) <= C.MAX_GROUND_STEP))) {
    p.y = ground;
    p.vy = 0;
    p.grounded = true;
  } else p.grounded = false;
  if (!grounded && p.grounded) startSlide();
  if (world.name === "flat") resolveHouses(p, previous);
  if (p.y < (ground ?? world.spawn.y) + C.RESPAWN_DEPTH) respawn(p, world);
  if (p.grounded || down) p.sprintJump = false;
  if (!p.grounded || Math.hypot(p.vx, p.vz) < 1) p.slideUntil = 0;
  p.anim = down ? 3 : now < (p.slideUntil ?? 0) ? C.SLIDE_ANIM : !p.grounded ? 2 : Math.hypot(p.vx, p.vz) > 0.2 ? 1 : 0;
}
export function stepPlayer(p: Body, input: Input, dt: number, world: MovementWorld = flatWorld) {
  p.simTime += dt * 1000;
  if (input.hit && !p.vehicleId && p.simTime >= p.knockdownUntil && p.simTime >= p.attackReadyAt)
    p.attackReadyAt = p.simTime + C.ATTACK_COOLDOWN_MS;
  if (p.vehicleId) {
    p.slideUntil = 0; p.slideBufferedUntil = 0; p.sprintJump = false;
    let impact = 0;
    if (p.vehicleKind === 0 || p.vehicleKind === 2 || (p.vehicleKind === C.LIME_KIND && p.seat === 0)) {
      const v = createVehicle(p.vehicleKind, p.x, p.z);
      v.y = p.y - (p.vehicleKind === C.LIME_KIND ? C.LIME_DECK_HEIGHT : p.vehicleKind===2 ? C.BIKE_SEAT_HEIGHT : C.CART_SEAT_HEIGHT);
      v.vx = p.vx; v.vz = p.vz; v.rotY = p.rotY;
      let drivingInput = input;
      if (p.vehicleKind === C.LIME_KIND) {
        const remaining = p.limeBoostMs ?? C.LIME_BOOST_DURATION_MS;
        const boosting = input.sprint && Math.hypot(input.x, input.z) > 0 && !p.limeBoostExhausted && remaining > 0;
        p.limeBoostMs = Math.max(0, Math.min(C.LIME_BOOST_DURATION_MS, remaining - (boosting ? dt * 1000 : 0)));
        if (p.limeBoostMs === 0) p.limeBoostExhausted = true;
        drivingInput = { ...input, sprint: boosting };
      }
      impact = stepCart(v, drivingInput, dt, world);
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
